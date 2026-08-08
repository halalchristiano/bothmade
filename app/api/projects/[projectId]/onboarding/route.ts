import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePrincipal, unauthorizedResponse, forbiddenResponse } from '@/lib/middleware';
import { sendOnboardingCompleteEmail } from '@/lib/email';
import { notifyAdminsOnboardingComplete } from '@/lib/notify';
import { resolveSiteUrl } from '@/lib/site-url';
import { ONBOARDING_ORDER } from '@/lib/onboarding';

/**
 * The title of the ProjectUpdate row that doubles as the "already announced"
 * marker. A constant because the guard below matches on it exactly — a typo
 * in one of two string literals would mail every client twice.
 */
const ONBOARDING_COMPLETE_TITLE = 'Onboarding complete';

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
      // The same order the studio sees. See ONBOARDING_ORDER: sorting on
      // `order` alone sorted nothing, because nothing ever set it.
      orderBy: ONBOARDING_ORDER,
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

    /*
     * The moment onboarding is finished, which nothing else notices.
     *
     * This form saves an answer at a time and has no submit button, so the
     * last answer is indistinguishable from the first — the client is never
     * told they are done, and nobody here is told the gate is clear. Both
     * sides were left inferring it from an empty screen.
     *
     * "Once" without a schema change: the ProjectUpdate row below is both the
     * client's timeline entry and the marker that says this already fired.
     * Written before the emails and used as the guard, so editing an answer
     * afterwards — which lands here again with everything still answered —
     * cannot send a second "you're all set". A migration would have run
     * against the production database for a boolean; this is a row we wanted
     * on the timeline anyway.
     */
    let completion: { toEmail: string; contactName: string | null; count: number } | null = null;
    try {
      const [questionCount, answeredCount] = await Promise.all([
        prisma.onboardingQuestion.count({ where: { projectId } }),
        prisma.onboardingResponse.count({
          where: { question: { projectId }, answer: { not: '' } },
        }),
      ]);

      if (questionCount > 0 && answeredCount >= questionCount) {
        const already = await prisma.projectUpdate.findFirst({
          where: { projectId, title: ONBOARDING_COMPLETE_TITLE },
          select: { id: true },
        });

        if (!already) {
          await prisma.projectUpdate.create({
            data: {
              projectId,
              title: ONBOARDING_COMPLETE_TITLE,
              description:
                "That's everything we asked for — thank you. Your answers are with the team and are what we'll design and build from.",
              statusStage: project.status,
              userId: null,
            },
          });

          const client = await prisma.client.findUnique({
            where: { id: project.clientId },
            select: { email: true, contactName: true, company: true },
          });

          await notifyAdminsOnboardingComplete({
            projectId,
            projectName: project.name,
            company: client?.company ?? 'A client',
            questionCount,
          }).catch((e) => console.error(`Onboarding complete notify failed for ${projectId}:`, e));

          if (client?.email) {
            completion = {
              toEmail: client.email,
              contactName: client.contactName,
              count: questionCount,
            };
          }
        }
      }
    } catch (e) {
      // The answer is saved; that is the thing this route owes the client.
      console.error(`Onboarding completion check failed for ${projectId}:`, e);
    }

    if (completion) {
      await sendOnboardingCompleteEmail({
        toEmail: completion.toEmail,
        contactName: completion.contactName,
        projectName: project.name,
        questionCount: completion.count,
        dashboardUrl: `${resolveSiteUrl()}/client/${projectId}`,
      }).catch((e) => console.error(`Onboarding complete email failed for ${projectId}:`, e));
    }

    return NextResponse.json({ success: true, response }, { status: 200 });
  } catch (error) {
    console.error('Submit onboarding answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
