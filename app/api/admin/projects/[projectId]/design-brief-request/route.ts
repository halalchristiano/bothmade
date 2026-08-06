import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { resolveSiteUrl } from '@/lib/site-url';
import { sendDesignBriefRequestEmail } from '@/lib/email';

/**
 * Ask the client for the design brief.
 *
 * The client dashboard has always had a card offering the form, and nothing
 * ever told them the card was there. The brief is a Client Dependency under
 * Section 6 — a delay in providing one extends the timeline day for day — so
 * a project could sit waiting on a form the client did not know existed, with
 * the clock running against them and nobody able to say when it started.
 *
 * Sending it is also what makes that clock honest: `sentAt` on the direction
 * is the date we asked.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId } = await params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        status: true,
        client: { select: { email: true, contactName: true } },
        designDirection: { select: { signedAt: true } },
      },
    });
    if (!project) return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });

    if (project.designDirection?.signedAt) {
      return NextResponse.json(
        { error: 'They have already filled the brief in — there is nothing to ask for.' },
        { status: 409 }
      );
    }

    const result = await sendDesignBriefRequestEmail({
      to: project.client.email,
      contactName: project.client.contactName,
      projectName: project.name,
      briefUrl: `${resolveSiteUrl()}/client/${projectId}`,
    });

    // Recorded whether or not the mail went, and which it was. "We asked and
    // they went quiet" and "we never asked" are different facts, and only one
    // of them makes a timeline extension defensible.
    await prisma.designDirection
      .upsert({
        where: { projectId },
        update: { sentAt: new Date() },
        create: { projectId, sentAt: new Date() },
      })
      .catch((e) => console.error('Design brief sentAt not recorded:', e));

    await prisma.projectUpdate
      .create({
        data: {
          projectId,
          title: 'We need your design brief',
          description:
            'We know what it has to do — this is the other half, what it should look and feel like. It takes about five minutes and it is on your dashboard.',
          statusStage: project.status,
          userId: session.userId,
        },
      })
      .catch((e) => console.error('Design brief request timeline entry failed:', e));

    return NextResponse.json(
      { success: true, sent: result.sent, reason: result.sent ? null : result.reason },
      { status: 200 }
    );
  } catch (error) {
    console.error('Design brief request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
