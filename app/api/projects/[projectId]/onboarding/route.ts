import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/middleware';

async function assertAccess(projectId: string) {
  const session = await getCurrentSession();
  if (!session) return { session: null, project: null };

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { session, project: null };

  if (session.type === 'client' && project.clientId !== session.clientId) {
    return { session, project: null };
  }

  return { session, project };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { session, project } = await assertAccess(projectId);
    if (!session) return unauthorizedResponse();
    if (!project) return forbiddenResponse();

    const questions = await prisma.onboardingQuestion.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: { response: true },
    });

    return NextResponse.json({ success: true, questions }, { status: 200 });
  } catch (error) {
    console.error('Get onboarding form error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { session, project } = await assertAccess(projectId);
    if (!session) return unauthorizedResponse();
    if (!project) return forbiddenResponse();

    const { questionId, answer } = await request.json();
    if (!questionId || typeof answer !== 'string') {
      return NextResponse.json(
        { error: 'questionId and answer are required' },
        { status: 400 }
      );
    }

    const question = await prisma.onboardingQuestion.findUnique({ where: { id: questionId } });
    if (!question || question.projectId !== projectId) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const trimmed = answer.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: 'Please give an answer before saving.' },
        { status: 400 }
      );
    }

    const response = await prisma.onboardingResponse.upsert({
      where: { questionId },
      update: { answer: trimmed },
      create: { questionId, answer: trimmed },
    });

    // Client.onboardingComplete was read in three places and written in
    // none — a flag that was always false, so "have they finished
    // onboarding?" had no answer anywhere and ops had to open the form and
    // count. Recomputed from the answers themselves on every save, so it
    // cannot drift: it is true exactly when every question on every one of
    // that client's projects has a non-empty answer.
    const outstanding = await prisma.onboardingQuestion.count({
      where: {
        project: { clientId: project.clientId },
        OR: [{ response: null }, { response: { answer: '' } }],
      },
    });

    // A client with no questions yet hasn't completed anything.
    const totalQuestions = await prisma.onboardingQuestion.count({
      where: { project: { clientId: project.clientId } },
    });
    const complete = totalQuestions > 0 && outstanding === 0;

    await prisma.client
      .update({ where: { id: project.clientId }, data: { onboardingComplete: complete } })
      .catch((error) => console.error('Failed to update onboarding flag:', error));

    return NextResponse.json(
      {
        success: true,
        response,
        onboardingComplete: complete,
        questionsRemaining: outstanding,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Submit onboarding answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
