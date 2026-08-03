import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateRandomPassword, getCurrentSession, hashPassword } from '@/lib/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/middleware';
import { sendEmail, renderShell } from '@/lib/email';
import { escapeHtml } from '@/lib/html';
import { TEAM_ROLES } from '../route';

function canManageTeam(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Change a team member's role or name, or reset their password.
 *
 * All of this previously required a database console, which meant in
 * practice it did not happen: roles stayed whatever they were set to on day
 * one, and a contractor who left kept working credentials indefinitely.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();
    if (!canManageTeam(session.role)) return forbiddenResponse();

    const { userId } = await params;
    const { role, name, title, resetPassword } = await request.json();

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Don't let the last owner demote themselves. An admin surface with
    // nobody able to administer it is only recoverable from a SQL console,
    // which is exactly the situation this endpoint exists to remove.
    if (role !== undefined && role !== 'owner' && target.role === 'owner') {
      const owners = await prisma.user.count({ where: { role: 'owner' } });
      if (owners <= 1) {
        return NextResponse.json(
          { error: "That's the only owner — promote someone else first." },
          { status: 400 }
        );
      }
    }

    if (role !== undefined && !(TEAM_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${TEAM_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    let temporaryPassword: string | null = null;
    if (resetPassword === true) {
      temporaryPassword = generateRandomPassword();
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        role: role !== undefined ? role : undefined,
        name: name !== undefined ? (name?.trim()?.slice(0, 100) || null) : undefined,
        title: title !== undefined ? (title?.trim()?.slice(0, 100) || null) : undefined,
        ...(temporaryPassword ? { password: await hashPassword(temporaryPassword) } : {}),
      },
      select: { id: true, name: true, email: true, role: true, title: true },
    });

    let emailSent = false;
    if (temporaryPassword) {
      emailSent = await sendEmail({
        to: updated.email,
        subject: 'Your Bothmade password has been reset',
        bypassSuppression: true,
        skipComplianceFooter: true,
        html: renderShell({
          eyebrow: 'Security',
          title: 'Your password has been reset',
          bodyHtml: `
            <p>Hi ${escapeHtml(updated.name || 'there')},</p>
            <p>Someone on the team reset your admin password. Use this to sign in, then change it under Settings.</p>
            <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0; font-family:monospace; font-size:14px;">
              <p style="margin:0;"><span style="color:rgba(255,255,255,0.4);">Temporary password:</span> <span style="color:#fff;">${escapeHtml(temporaryPassword)}</span></p>
            </div>
            <p style="font-size:13px; color:rgba(255,255,255,0.5);">If you weren't expecting this, tell the team immediately — it means someone else can currently sign in as you.</p>
          `,
          ctaLabel: 'Sign in',
          ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/admin/login`,
        }),
      });
    }

    return NextResponse.json(
      {
        success: true,
        user: updated,
        emailSent,
        // Shown once, and only when the email didn't get through — otherwise
        // a bounced reset locks the person out with no way back in.
        temporaryPassword: temporaryPassword && !emailSent ? temporaryPassword : undefined,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Remove a team member.
 *
 * Their leads are reassigned to whoever is doing the removing rather than
 * being orphaned — `onDelete: SetNull` would leave them unassigned, and an
 * unassigned lead is one nobody has agreed to work.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();
    if (!canManageTeam(session.role)) return forbiddenResponse();

    const { userId } = await params;

    if (userId === session.userId) {
      return NextResponse.json(
        { error: "You can't remove your own account." },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }
    if (target.role === 'owner') {
      const owners = await prisma.user.count({ where: { role: 'owner' } });
      if (owners <= 1) {
        return NextResponse.json(
          { error: "That's the only owner — promote someone else first." },
          { status: 400 }
        );
      }
    }

    const [reassigned] = await prisma.$transaction([
      prisma.lead.updateMany({
        where: { assignedToId: userId },
        data: { assignedToId: session.userId },
      }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    return NextResponse.json(
      { success: true, leadsReassigned: reassigned.count },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
