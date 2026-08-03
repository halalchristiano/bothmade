import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePrincipal, unauthorizedResponse, forbiddenResponse } from '@/lib/middleware';

async function assertAccess(projectId: string) {
  const { session, response } = await requirePrincipal();
  if (!session) return { session: null, project: null, response };

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { session, project: null, response: null };

  if (session.type === 'client' && project.clientId !== session.clientId) {
    return { session, project: null, response: null };
  }

  return { session, project, response: null };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { session, project, response } = await assertAccess(projectId);
    if (!session) return response ?? unauthorizedResponse();
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
    const { session, project, response: denied } = await assertAccess(projectId);
    if (!session) return denied ?? unauthorizedResponse();
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

    const response = await prisma.onboardingResponse.upsert({
      where: { questionId },
      update: { answer },
      create: { questionId, answer },
    });

    return NextResponse.json({ success: true, response }, { status: 200 });
  } catch (error) {
    console.error('Submit onboarding answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
