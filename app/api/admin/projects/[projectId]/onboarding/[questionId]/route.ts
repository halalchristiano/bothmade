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

    const { questionId } = await params;
    await prisma.onboardingQuestion.delete({ where: { id: questionId } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete onboarding question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
