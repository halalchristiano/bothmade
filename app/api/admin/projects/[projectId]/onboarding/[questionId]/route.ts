import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; questionId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { projectId, questionId } = await params;

    // The projectId in the path was decorative: a DELETE on
    // /projects/<anything>/onboarding/<questionId> deleted that question
    // regardless of which project it belonged to. Scope the write to the
    // path so the URL means what it says, and a stale tab or a mistyped id
    // can't reach across into another project's form.
    const { count } = await prisma.onboardingQuestion.deleteMany({
      where: { id: questionId, projectId },
    });

    if (count === 0) {
      return NextResponse.json(
        { error: 'Question not found on this project' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete onboarding question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
