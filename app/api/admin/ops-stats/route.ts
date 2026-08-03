import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { getPeriodStart, type StatsRange } from '@/app/api/admin/sales-stats/route';
import { BUSINESS_TIMEZONE, startOfBusinessMonthOffset } from '@/lib/business-time';

const RANGE_LABELS: Record<StatsRange, string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'This Quarter',
};

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range');
    const range: StatsRange = rangeParam === 'week' || rangeParam === 'quarter' ? rangeParam : 'month';

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodStart = getPeriodStart(range, now);
    // Prior period of equal length, for the trend comparison.
    const previousPeriodStart = new Date(periodStart.getTime() - (now.getTime() - periodStart.getTime()));

    const [
      activeProjects,
      newHandoffs,
      newClientsInPeriod,
      paymentsInPeriod,
      paymentsInPreviousPeriod,
      recentClientMessages,
      recentPayments,
      recentLeadWins,
    ] = await Promise.all([
      prisma.project.findMany({
        where: { status: { not: 'complete' } },
        include: {
          client: { select: { company: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          // Needed to work out when the project last actually moved, and to
          // total what's been paid without a query per project.
          updates: { orderBy: { createdAt: 'desc' }, take: 1 },
          payments: { select: { amount: true } },
        },
      }),
      // Unacknowledged handoffs never age out of this list, no matter which
      // period is selected — a handoff nobody picked up is exactly the thing
      // a period filter would otherwise quietly hide. Already-acknowledged
      // ones still respect the period, so the widget doesn't fill up with
      // old, already-handled rows.
      prisma.project.findMany({
        where: {
          OR: [{ handoffAcknowledgedAt: null }, { createdAt: { gte: periodStart } }],
        },
        include: {
          client: { select: { company: true, contactName: true, email: true } },
          onboardingQuestions: { include: { response: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.client.count({ where: { createdAt: { gte: periodStart } } }),
      prisma.payment.findMany({ where: { createdAt: { gte: periodStart } } }),
      prisma.payment.findMany({ where: { createdAt: { gte: previousPeriodStart, lt: periodStart } } }),
      prisma.projectMessage.findMany({
        where: { isFromAdmin: false, createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { project: { select: { id: true, name: true, client: { select: { company: true } } } } },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { project: { select: { id: true, name: true, client: { select: { company: true } } } } },
      }),
      prisma.leadActivity.findMany({
        where: { type: 'proposal', createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { lead: { select: { id: true, company: true } } },
      }),
    ]);

    // Last 6 months of revenue, oldest first, for the trend chart.
    // Anchored to the studio's timezone: on a UTC server these buckets
    // straddled the month boundary and revenue landed in the wrong bar.
    const monthStarts = Array.from({ length: 6 }, (_, i) => {
      const monthsAgo = 5 - i;
      const start = startOfBusinessMonthOffset(monthsAgo, now);
      const end = startOfBusinessMonthOffset(monthsAgo - 1, now);
      return {
        start,
        end,
        label: start.toLocaleDateString('en-US', { month: 'short', timeZone: BUSINESS_TIMEZONE }),
      };
    });
    const revenueHistory = await Promise.all(
      monthStarts.map(async ({ start, end, label }) => {
        const payments = await prisma.payment.findMany({ where: { createdAt: { gte: start, lt: end } } });
        return { label, value: payments.reduce((s, p) => s + p.amount, 0), year: start.getFullYear(), month: start.getMonth() };
      })
    );

    const awaitingSignature = await prisma.lead.findMany({
      where: { contractStatus: 'sent' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, company: true, updatedAt: true },
    });

    const pendingMockups = await prisma.lead.findMany({
      where: { mockupRequested: true, mockupUrl: null },
      orderBy: { mockupRequestedAt: 'asc' },
      take: 10,
      select: { id: true, company: true, mockupRequestedAt: true },
    });

    // A project can reach Complete with nobody having actually pointed the
    // client's dashboard at the shipped site — the celebratory "delivery
    // moment" quietly ships without its CTA. This is the one thing left to
    // do after everything else is done, so it needs its own nudge.
    const readyToDeliver = await prisma.project.findMany({
      where: { statusStage: { gte: 4 }, liveUrl: null },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { client: { select: { company: true } } },
    });

    // "Nothing has happened for a week" covers two opposite situations: work
    // that's been dropped, and work that can't move until the client comes
    // back. One needs doing, the other needs chasing — and mixing them makes
    // the whole list read as a guilt list, so the genuinely blocked ones never
    // get chased because they look identical to everything else.
    //
    // Who spoke last decides it. Our message with no reply since means the
    // ball is with them; anything else means it's with us.
    // When did this project last actually move?
    //
    // This used to be project.updatedAt alone, which is not bumped when a
    // message or an update is written — so a project with a conversation
    // running that same morning was reported as a week silent, and the
    // at-risk list filled up with work that was visibly fine. Whichever of
    // the three is most recent is the honest answer.
    const lastActivityAt = (p: (typeof activeProjects)[number]) =>
      new Date(
        Math.max(
          p.updatedAt.getTime(),
          p.messages[0]?.createdAt.getTime() ?? 0,
          p.updates[0]?.createdAt.getTime() ?? 0
        )
      );

    const atRisk = activeProjects
      .filter((p) => lastActivityAt(p) < staleThreshold)
      .map((p) => {
        const last = p.messages[0];
        const waitingOnClient = !!last?.isFromAdmin;
        const activeAt = lastActivityAt(p);
        return {
          id: p.id,
          name: p.name,
          company: p.client.company,
          status: p.status,
          updatedAt: activeAt,
          daysSinceUpdate: Math.floor((now.getTime() - activeAt.getTime()) / (24 * 60 * 60 * 1000)),
          waitingOnClient,
          // Days since we last chased — the number that matters when deciding
          // whether to chase again.
          daysSinceWeAsked: last
            ? Math.floor((now.getTime() - last.createdAt.getTime()) / (24 * 60 * 60 * 1000))
            : null,
          neverMessaged: !last,
        };
      })
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

    const waitingOnClient = atRisk.filter((p) => p.waitingOnClient);
    const atRiskProjects = atRisk.filter((p) => !p.waitingOnClient);

    // Outstanding, not overdue.
    //
    // Every unpaid balance on every active project was being listed as
    // "Overdue Balances", including deposits taken this morning on projects
    // that have not reached Launch and whose balance is not due yet by the
    // terms of the agreement. A list where most rows aren't actually late
    // trains you to skim past the ones that are. `overdue` is now a real
    // date having passed; everything else is simply outstanding.
    //
    // Also: this was one payment aggregate query per project. The payments
    // come back with the projects now.
    const outstandingBalances = activeProjects
      .map((p) => {
        const amountPaid = p.payments.reduce((sum, pay) => sum + pay.amount, 0);
        const balanceDue = p.totalPrice - amountPaid;
        const dueAt = p.balanceDueAt;
        const overdue = Boolean(dueAt && dueAt < now && balanceDue > 0);
        return {
          id: p.id,
          name: p.name,
          company: p.client.company,
          balanceDue,
          statusStage: p.statusStage,
          balanceDueAt: dueAt,
          overdue,
          daysOverdue:
            overdue && dueAt
              ? Math.floor((now.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000))
              : 0,
          lastPaymentReminderSentAt: p.lastPaymentReminderSentAt,
        };
      })
      .filter((p) => p.balanceDue > 0)
      // Genuinely late first, then by size.
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.balanceDue - a.balanceDue);
    const projectsAwaitingReply = activeProjects
      .filter((p) => p.messages.length > 0 && !p.messages[0].isFromAdmin)
      .map((p) => ({
        id: p.id,
        name: p.name,
        company: p.client.company,
        waitHours: Math.floor((now.getTime() - p.messages[0].createdAt.getTime()) / (60 * 60 * 1000)),
      }))
      .sort((a, b) => b.waitHours - a.waitHours);

    const revenueThisMonth = paymentsInPeriod.reduce((s, p) => s + p.amount, 0);
    const revenueLastMonth = paymentsInPreviousPeriod.reduce((s, p) => s + p.amount, 0);

    return NextResponse.json(
      {
        success: true,
        stats: {
          range,
          periodLabel: RANGE_LABELS[range],
          newHandoffs: newHandoffs
            .slice()
            // Unpicked-up handoffs first, oldest (most overdue) first within
            // that group; already-acknowledged ones trail behind, most
            // recent first — matches how urgently each row deserves attention.
            .sort((a, b) => {
              if (!a.handoffAcknowledgedAt !== !b.handoffAcknowledgedAt) {
                return a.handoffAcknowledgedAt ? 1 : -1;
              }
              return a.handoffAcknowledgedAt
                ? b.createdAt.getTime() - a.createdAt.getTime()
                : a.createdAt.getTime() - b.createdAt.getTime();
            })
            .map((p) => ({
              id: p.id,
              name: p.name,
              company: p.client.company,
              contactName: p.client.contactName,
              createdAt: p.createdAt,
              onboardingTotal: p.onboardingQuestions.length,
              onboardingAnswered: p.onboardingQuestions.filter((q) => q.response).length,
              handoffAcknowledgedAt: p.handoffAcknowledgedAt,
              daysWaiting: Math.floor((now.getTime() - p.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
            })),
          newClientsThisWeek: newClientsInPeriod,
          atRiskProjects: atRiskProjects.slice(0, 40),
          waitingOnClient: waitingOnClient.slice(0, 40),
          // `overdueBalances` is kept as a key for the existing dashboard
          // and weekly digest, but now means what it says: past its due
          // date. Everything owed is under `outstandingBalances`.
          outstandingBalances,
          overdueBalances: outstandingBalances.filter((p) => p.overdue),
          projectsAwaitingReply,
          awaitingSignature: awaitingSignature.map((l) => ({ id: l.id, company: l.company, updatedAt: l.updatedAt })),
          pendingMockups: pendingMockups.map((l) => ({ id: l.id, company: l.company, mockupRequestedAt: l.mockupRequestedAt })),
          readyToDeliver: readyToDeliver.map((p) => ({ id: p.id, name: p.name, company: p.client.company, updatedAt: p.updatedAt })),
          revenueThisMonth,
          revenueLastMonth,
          revenueHistory,
          activeProjectCount: activeProjects.length,
          activityFeed: [
            ...recentClientMessages.map((m) => ({
              type: 'message' as const,
              id: m.id,
              projectId: m.project.id,
              label: `${m.project.client.company} messaged on ${m.project.name}`,
              preview: m.content.slice(0, 120),
              createdAt: m.createdAt,
            })),
            ...recentPayments.map((p) => ({
              type: 'payment' as const,
              id: p.id,
              projectId: p.project.id,
              label: `${p.project.client.company} paid on ${p.project.name}`,
              preview: `$${(p.amount / 100).toLocaleString()} (${p.type})`,
              createdAt: p.createdAt,
            })),
            ...recentLeadWins.map((a) => ({
              type: 'proposal' as const,
              id: a.id,
              projectId: null,
              leadId: a.lead.id,
              label: `Proposal sent to ${a.lead.company}`,
              preview: a.content.slice(0, 120),
              createdAt: a.createdAt,
            })),
          ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 40),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get ops stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
