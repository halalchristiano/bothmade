import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { OPS, requireRole } from '@/lib/authz';

const VALID_TYPES = ['text', 'textarea', 'select'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, OPS);
    if (denied) return denied;


    const { projectId } = await params;

    const questions = await prisma.onboardingQuestion.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: { response: true },
    });

    return NextResponse.json({ success: true, questions }, { status: 200 });
  } catch (error) {
    console.error('Get onboarding questions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, OPS);
    if (denied) return denied;


    const { projectId } = await params;
    const { question, type = 'text', options = '', order = 0 } = await request.json();

    if (!question || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: 'Question text and a valid type are required' },
        { status: 400 }
      );
    }

    const created = await prisma.onboardingQuestion.create({
      data: { projectId, question, type, options, order },
    });

    return NextResponse.json({ success: true, question: created }, { status: 201 });
  } catch (error) {
    console.error('Create onboarding question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
