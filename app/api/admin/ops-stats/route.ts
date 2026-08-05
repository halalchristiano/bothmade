import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { projectBalance, type BalanceInstalment } from '@/lib/billing';
import { getPeriodStart, type StatsRange } from '@/app/api/admin/sales-stats/route';

const RANGE_LABELS: Record<StatsRange, string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'This Quarter',
};

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range');
    const range: StatsRange = rangeParam === 'week' || rangeParam === 'quarter' ? rangeParam : 'month';

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const periodStart = getPeriodStart(range, now);
    // Prior period of equal length, for the trend comparison.
    const previousPeriodStart = new Date(periodStart.getTime() - (now.getTime() - periodStart.getTime()));

    /**
     * A project somebody has said "not this week" about.
     *
     * Filtered out of every list that nags — handoffs, quiet projects,
     * unanswered messages, money — and out of none of the lists that count
     * (active project count, revenue). Snoozing is a decision about when to be
     * reminded, never a change to what is true.
     */
    const snoozed = (p: { prioritySnoozedUntil: Date | null }) =>
      !!p.prioritySnoozedUntil && p.prioritySnoozedUntil > now;

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
        },
      }),
      // Unacknowledged handoffs never age out of this list, no matter which
      // period is selected — a handoff nobody picked up is exactly the thing
      // a period filter would otherwise quietly hide. Already-acknowledged
      // ones still respect the period, so the widget doesn't fill up with
      // old, already-handled rows.
      prisma.project.findMany({
        where: {
          // AND rather than two OR keys: an object literal can only carry one
          // `OR`, and the second would silently win.
          AND: [
            { OR: [{ handoffAcknowledgedAt: null }, { createdAt: { gte: periodStart } }] },
            { OR: [{ prioritySnoozedUntil: null }, { prioritySnoozedUntil: { lte: now } }] },
          ],
          // An archived client is one somebody deliberately put away. Their
          // projects were still turning up here as work waiting to be picked
          // up, which is how a list of things to do fills with things nobody
          // is going to do.
          client: { archivedAt: null },
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
    const monthStarts = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const next = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
      return { start: d, end: next, label: d.toLocaleDateString('en-US', { month: 'short' }) };
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
      where: {
        statusStage: { gte: 4 },
        liveUrl: null,
        OR: [{ prioritySnoozedUntil: null }, { prioritySnoozedUntil: { lte: now } }],
      },
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
    const atRisk = activeProjects
      .filter((p) => p.updatedAt < staleThreshold && !snoozed(p))
      .map((p) => {
        const last = p.messages[0];
        const waitingOnClient = !!last?.isFromAdmin;
        return {
          id: p.id,
          name: p.name,
          company: p.client.company,
          status: p.status,
          updatedAt: p.updatedAt,
          daysSinceUpdate: Math.floor((now.getTime() - p.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
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

    // One query for every project's money, not one per project. This used to
    // be a `payment.aggregate` inside a `Promise.all` over the active list —
    // fine at four projects, a hundred round trips at a hundred.
    const projectIds = activeProjects.map((p) => p.id);
    const [scopePayments, activeInstalments] = await Promise.all([
      prisma.payment.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, amount: true, type: true },
      }),
      prisma.instalment.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, status: true, amountCents: true, trigger: true },
      }),
    ]);
    const paymentsByProject = new Map<string, Array<{ amount: number; type: string }>>();
    for (const p of scopePayments) {
      const list = paymentsByProject.get(p.projectId) ?? [];
      list.push({ amount: p.amount, type: p.type });
      paymentsByProject.set(p.projectId, list);
    }
    const instalmentsByProject = new Map<string, BalanceInstalment[]>();
    for (const i of activeInstalments) {
      const list = instalmentsByProject.get(i.projectId) ?? [];
      list.push({ status: i.status, amountCents: i.amountCents, trigger: i.trigger });
      instalmentsByProject.set(i.projectId, list);
    }

    // See projectBalance(): "what's outstanding" is three different questions,
    // and answering them as one number is what made this list flag every live
    // project forever.
    const balances = activeProjects.filter((p) => !snoozed(p)).map((p) => {
      const balance = projectBalance({
        totalPrice: p.totalPrice,
        statusStage: p.statusStage,
        payments: paymentsByProject.get(p.id) ?? [],
        instalments: instalmentsByProject.get(p.id) ?? [],
      });
      return {
        id: p.id,
        name: p.name,
        company: p.client.company,
        // Kept under its old name because every consumer reads it: this is
        // now "invoiced and unpaid" rather than "everything not yet paid".
        balanceDue: balance.dueNowCents,
        remainingCents: balance.remainingCents,
        unbilledCents: balance.unbilledCents,
        gatedCents: balance.gatedCents,
        statusStage: p.statusStage,
        lastPaymentReminderSentAt: p.lastPaymentReminderSentAt,
      };
    });
    const overdueBalances = balances;
    const projectsAwaitingReply = activeProjects
      .filter((p) => p.messages.length > 0 && !p.messages[0].isFromAdmin && !snoozed(p))
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
          overdueBalances: overdueBalances.filter((p) => p.balanceDue > 0).sort((a, b) => b.balanceDue - a.balanceDue),
          // Past its gate, invoice never sent. This is the one that costs
          // real money: nobody is late, nobody has been asked.
          unbilledInstalments: balances
            .filter((p) => p.unbilledCents > 0)
            .sort((a, b) => b.unbilledCents - a.unbilledCents)
            .map((p) => ({ id: p.id, name: p.name, company: p.company, unbilledCents: p.unbilledCents })),
          projectsAwaitingReply,
          awaitingSignature: awaitingSignature.map((l) => ({ id: l.id, company: l.company, updatedAt: l.updatedAt })),
          pendingMockups: pendingMockups.map((l) => ({ id: l.id, company: l.company, mockupRequestedAt: l.mockupRequestedAt })),
          readyToDeliver: readyToDeliver.map((p) => ({ id: p.id, name: p.name, company: p.client.company, updatedAt: p.updatedAt })),
          revenueThisMonth,
          revenueLastMonth,
          revenueHistory,
          activeProjectCount: activeProjects.length,
          // Said out loud on the page. A list that quietly hides rows is a
          // list you stop believing is complete.
          snoozed: activeProjects
            .filter(snoozed)
            .map((p) => ({
              id: p.id,
              company: p.client.company,
              until: p.prioritySnoozedUntil,
            })),
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
