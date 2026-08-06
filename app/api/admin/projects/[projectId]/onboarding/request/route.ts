import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { resolveSiteUrl } from '@/lib/site-url';
import { sendOnboardingRequestEmail } from '@/lib/email';

/**
 * Ask the client to answer the onboarding questions.
 *
 * The form worked and did nothing: adding a question wrote a row and told
 * nobody, so the client found it only by opening a tab they had no reason to
 * open, and "awaiting answer" sat on the project indefinitely with no way to
 * chase it.
 *
 * These are Client Dependencies under Section 6 — a delay in providing one
 * extends the timeline day for day — so asking plainly, on a recorded date,
 * is in everyone's interest.
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
        onboardingQuestions: { include: { response: true } },
      },
    });
    if (!project) return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });

    const outstanding = project.onboardingQuestions.filter((q) => !q.response).length;
    if (outstanding === 0) {
      return NextResponse.json(
        { error: 'Everything on the form is answered — there is nothing to ask for.' },
        { status: 409 }
      );
    }

    // The login, not the project page. A client who is signed out lands on a
    // redirect and has to find their way back; sending them where they start
    // is one fewer reason to close the tab.
    const result = await sendOnboardingRequestEmail({
      to: project.client.email,
      contactName: project.client.contactName,
      projectName: project.name,
      outstanding,
      loginUrl: `${resolveSiteUrl()}/client/login`,
    });

    await prisma.projectUpdate
      .create({
        data: {
          projectId,
          title: `${outstanding} question${outstanding === 1 ? '' : 's'} waiting on you`,
          description:
            'These are the things we cannot start without — access, content, and who decides what. They are under Onboarding on this project, and most take a sentence.',
          statusStage: project.status,
          userId: session.userId,
        },
      })
      .catch((e) => console.error('Onboarding request timeline entry failed:', e));

    return NextResponse.json(
      { success: true, sent: result.sent, outstanding, reason: result.sent ? null : result.reason },
      { status: 200 }
    );
  } catch (error) {
    console.error('Onboarding request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
