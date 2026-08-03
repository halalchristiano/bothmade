import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateRandomPassword, getCurrentSession, hashPassword } from '@/lib/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/middleware';
import { sendEmail, renderShell } from '@/lib/email';
import { escapeHtml } from '@/lib/html';

/** The roles a team member can hold. Anything else is rejected. */
export const TEAM_ROLES = ['owner', 'sales', 'admin'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value);
}

/** Only an owner/admin can change who is on the team or what they can do. */
function canManageTeam(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Team members. Adding a rep, changing a role, or resetting a password all
 * previously meant a database console — which in practice meant it did not
 * happen, and a departing contractor kept working credentials.
 */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    // The assignment dropdowns only need id/name/email; the management UI
    // needs more. Managers get the fuller shape, everyone else the minimum.
    const manage = canManageTeam(session.role);

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        ...(manage
          ? {
              role: true,
              title: true,
              createdAt: true,
              gmailAddress: true,
              gmailConnectedAt: true,
              gmailNeedsReconnect: true,
              weeklyDigestOptOut: true,
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, users, canManage: manage }, { status: 200 });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Add a team member. They receive a temporary password by email. */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();
    if (!canManageTeam(session.role)) return forbiddenResponse();

    const { email, name, role, title } = await request.json();

    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalized || !/^[^\s@<>"']+@[^\s@<>"'.]+\.[^\s@<>"']{2,}$/.test(normalized)) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }
    if (!isTeamRole(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${TEAM_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      return NextResponse.json(
        { error: 'Someone with that email is already on the team.' },
        { status: 409 }
      );
    }

    const temporaryPassword = generateRandomPassword();
    const user = await prisma.user.create({
      data: {
        email: normalized,
        password: await hashPassword(temporaryPassword),
        name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : null,
        role,
        title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 100) : null,
      },
      select: { id: true, name: true, email: true, role: true },
    });

    const sent = await sendEmail({
      to: normalized,
      subject: 'Your Bothmade admin account',
      // They are waiting on this to get in; a marketing opt-out elsewhere
      // must not withhold their own credentials.
      bypassSuppression: true,
      skipComplianceFooter: true,
      html: renderShell({
        eyebrow: 'Welcome',
        title: 'Your Bothmade admin account',
        bodyHtml: `
          <p>Hi ${escapeHtml(user.name || 'there')},</p>
          <p>An account has been created for you on the Bothmade admin.</p>
          <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:18px 20px; margin:20px 0; font-family:monospace; font-size:14px;">
            <p style="margin:0 0 6px 0;"><span style="color:rgba(255,255,255,0.4);">Email:</span> <span style="color:#fff;">${escapeHtml(normalized)}</span></p>
            <p style="margin:0;"><span style="color:rgba(255,255,255,0.4);">Temporary password:</span> <span style="color:#fff;">${escapeHtml(temporaryPassword)}</span></p>
          </div>
          <p style="font-size:13px; color:rgba(255,255,255,0.5);">Change it once you're in, via Settings.</p>
        `,
        ctaLabel: 'Sign in',
        ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/admin/login`,
      }),
    });

    return NextResponse.json(
      {
        success: true,
        user,
        emailSent: sent,
        // Surfaced so the account is usable even if the email bounced —
        // otherwise a failed send silently creates an unreachable account.
        temporaryPassword: sent ? undefined : temporaryPassword,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
