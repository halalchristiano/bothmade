import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { ONBOARDING_ORDER, ONBOARDING_TYPES } from '@/lib/onboarding';

// The one list, shared with both sides of the form. It grew — "pick any"
// and "yes or no" — and a route with its own copy silently rejected the new
// ones with "a valid type is required", which named nothing.
const VALID_TYPES = ONBOARDING_TYPES.map((t) => t.value) as string[];

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
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const { projectId } = await params;

    const questions = await prisma.onboardingQuestion.findMany({
      where: { projectId },
      orderBy: ONBOARDING_ORDER,
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
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const { projectId } = await params;
    const { question, type = 'text', options = '', order } = await request.json();

    if (!question || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: 'Question text and a valid type are required' },
        { status: 400 }
      );
    }

    /*
     * Where in the form this one goes.
     *
     * `order` used to default to 0, and the builder has never sent one — so
     * every question on every project shared a single position and the sort
     * on it did nothing. New questions now land after whatever is already
     * there, which is what "add a question" has always meant on screen: the
     * one you just wrote appears at the bottom of the list and stays there.
     *
     * A caller may still name a position; nothing does today, and refusing
     * one would make reordering unimplementable from outside.
     */
    const position =
      typeof order === 'number' && Number.isFinite(order)
        ? order
        : ((
            await prisma.onboardingQuestion.aggregate({
              where: { projectId },
              _max: { order: true },
            })
          )._max.order ?? -1) + 1;

    const created = await prisma.onboardingQuestion.create({
      data: { projectId, question, type, options, order: position },
    });

    return NextResponse.json({ success: true, question: created }, { status: 201 });
  } catch (error) {
    console.error('Create onboarding question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
