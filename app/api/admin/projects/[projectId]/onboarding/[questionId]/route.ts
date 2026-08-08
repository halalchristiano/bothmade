import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';

/**
 * Remove one question from a project's onboarding form.
 *
 * Two things this owes its caller, neither of which it did:
 *
 * **Stay inside the project in the URL.** It looked the question up by id
 * alone, so `/projects/A/onboarding/<a question on project B>` deleted the
 * question on project B and answered 200. Every caller here is staff and
 * every project is ours, so this is not a privilege boundary — it is a
 * correctness one. A tab left open on a project, or an id pasted from
 * somewhere else, could take a question off a form nobody was looking at,
 * and the response gave no hint that it had happened somewhere else.
 *
 * **Treat a question that has already gone as done, not as a crash.**
 * `delete` throws P2025 when nothing matches, which came back as a 500 —
 * so a question removed in another tab, or double-clicked, produced a server
 * error for a form that was already in the state the caller wanted. The team
 * chat route made this same change for the same reason: a row deleted
 * between render and click is "nothing to do".
 *
 * The 404 is what tells the UI its list is stale. It is not a failure worth
 * putting in front of anybody — the caller reloads and the question is gone,
 * which is what they asked for.
 *
 * Deleting takes the client's answer with it: OnboardingResponse cascades
 * from the question. That is right — an answer to a question nobody asked is
 * not a record of anything — but it is destructive and irreversible, which is
 * why the button that calls this asks first.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; questionId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId, questionId } = await params;

    const removed = await prisma.onboardingQuestion.deleteMany({
      where: { id: questionId, projectId },
    });

    if (removed.count === 0) {
      return NextResponse.json(
        { error: 'That question is no longer on this form.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete onboarding question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
