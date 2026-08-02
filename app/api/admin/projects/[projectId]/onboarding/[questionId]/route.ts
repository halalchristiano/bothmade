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
    // Scope the delete to the project in the URL so a question id can't be
    // deleted out from under a different project.
    const result = await prisma.onboardingQuestion.deleteMany({
      where: { id: questionId, projectId },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'Question not found for this project' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete onboarding question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
