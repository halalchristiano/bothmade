import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { projectBalance, type BalanceInstalment } from '@/lib/billing';
import { getPeriodStart, type StatsRange } from '@/app/api/admin/sales-stats/route';
import { MOCKUPS_TO_BUILD_WHERE } from '@/lib/mockups';
import { sumPaymentsBetween } from '@/lib/revenue';
import { formatCentsExact } from '@/lib/pricing';

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

    // Last 6 months, oldest first, for the trend chart.
    const monthStarts = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const next = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
      return { start: d, end: next, label: d.toLocaleDateString('en-US', { month: 'short' }) };
    });

    /*
     * The earliest instant any revenue figure on this page reaches back to.
     *
     * All of them — the six chart bars, the period total, the prior-period
     * total behind the trend arrow — are sums of the same column over
     * different windows of one span. They were eight separate findMany calls
     * returning whole Payment rows so that `.reduce((s, p) => s + p.amount)`
     * could add up one integer from each: six sequential round trips for the
     * chart alone, inside a Promise.all that made them look concurrent.
     *
     * One query, two columns, bucketed below.
     */
    const revenueSince = new Date(
      Math.min(monthStarts[0].start.getTime(), previousPeriodStart.getTime())
    );

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
      revenuePayments,
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
      prisma.payment.findMany({
        where: { createdAt: { gte: revenueSince } },
        select: { amount: true, createdAt: true },
      }),
      prisma.projectMessage.findMany({
        where: { isFromAdmin: false, createdAt: { gte: periodStart } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { project: { select: { id: true, name: true, client: { select: { company: true } } } } },
      }),
      // Period-scoped like the two feed sources either side of it. Unfiltered,
      // this was the newest 25 payments of all time competing for the same 40
      // slots as one week of messages — so a quiet week read as months-old
      // payment history, and widening the range picker moved every source in
      // the feed except this one.
      prisma.payment.findMany({
        where: { createdAt: { gte: periodStart } },
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

    // Every revenue figure on the page, summed out of the one query above.
    const sumBetween = (from: Date, to?: Date) => sumPaymentsBetween(revenuePayments, from, to);

    const revenueHistory = monthStarts.map(({ start, end, label }) => ({
      label,
      value: sumBetween(start, end),
      year: start.getFullYear(),
      month: start.getMonth(),
    }));

    /**
     * A number, because the dashboard only ever wanted the number.
     *
     * This was a `take: 10` list whose length was rendered as the headline
     * stat, so the eleventh unsigned contract — and every one after it — was
     * invisible, and the tile read a flat "10" forever. Nothing consumed the
     * rows themselves; the list of who to chase comes down the sales half,
     * per rep, with phone numbers on it.
     *
     * Won and lost are excluded, matching /api/admin/today and the sales
     * half's active-only filter. A dead lead's unsigned contract is not
     * awaiting anything, and counting it made the tile disagree with the
     * rows underneath it.
     */
    const awaitingSignatureCount = await prisma.lead.count({
      where: { contractStatus: 'sent', status: { notIn: ['won', 'lost'] } },
    });

    const pendingMockups = await prisma.lead.findMany({
      where: MOCKUPS_TO_BUILD_WHERE,
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

    /**
     * Design feedback nobody here has opened.
     *
     * Top of the priority list, above the money, because it is the only row
     * where a client has already done their part and stopped. Their Section 4
     * review clock stopped when they hit send, so the project cannot move,
     * the next payment gate cannot open, and somebody is sitting there
     * wondering whether we received it.
     *
     * Deliberately NOT snooze-aware, unlike everything around it. A snooze
     * says "seen it, not this week", which is a defensible answer to an
     * unpaid balance and not a defensible answer to a client waiting for a
     * reply they were promised.
     */
    const unreadDesignFeedback = await prisma.designFeedback.findMany({
      where: { reviewedAt: null },
      // Newest first. Priorities keeps one row per project, and the row that
      // wins should name the round we have to build to — pointing at the
      // oldest unread one sends you off to satisfy a brief the client has
      // already replaced.
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        round: true,
        createdAt: true,
        project: { select: { id: true, name: true, client: { select: { company: true } } } },
      },
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
          // Needed to build the public status URL. That page is addressed by
          // capability token, not by project ID, so a link without it 404s.
          shareToken: p.shareToken,
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
        // The two recorded moments outrank the stage — see gateReached().
        // Without them the priorities list calls a payment "gated" on a
        // project we have already told the client is ready to go live.
        designApprovedAt: p.designApprovedAt,
        readyForLaunchAt: p.readyForLaunchAt,
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
        // The chase list opens the client's own status page, and that page is
        // a capability link — without the token every button on it 404s.
        shareToken: p.shareToken,
      };
    });
    /*
     * Only the projects that actually owe something.
     *
     * This was `= balances`, i.e. every live project, most of them owing
     * nothing. Nothing on the dashboard rendered it so the mistake stayed
     * invisible there, but /admin/priorities iterates this list straight into
     * rows — so a paid-up project in good health produced "$0.00 invoiced and
     * still unpaid" on the priorities screen, and enough of them to bury the
     * projects that genuinely owe money.
     *
     * dueNowCents, not remaining or unbilled: this is the chase list, and the
     * only figure on it that somebody else is late paying.
     */
    const overdueBalances = balances
      .filter((b) => b.balanceDue > 0)
      .sort((a, b) => b.balanceDue - a.balanceDue);
    const projectsAwaitingReply = activeProjects
      .filter((p) => p.messages.length > 0 && !p.messages[0].isFromAdmin && !snoozed(p))
      .map((p) => ({
        id: p.id,
        name: p.name,
        company: p.client.company,
        waitHours: Math.floor((now.getTime() - p.messages[0].createdAt.getTime()) / (60 * 60 * 1000)),
      }))
      .sort((a, b) => b.waitHours - a.waitHours);

    const revenueThisMonth = sumBetween(periodStart);
    const revenueLastMonth = sumBetween(previousPeriodStart, periodStart);

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
              shareToken: p.shareToken,
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
          // A client who has stopped and is waiting on us to read something
          // they were asked to write. Nothing moves until somebody does.
          unreadDesignFeedback: unreadDesignFeedback.map((f) => ({
            id: f.id,
            projectId: f.project.id,
            name: f.project.name,
            company: f.project.client.company,
            round: f.round,
            daysWaiting: Math.floor((now.getTime() - f.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
          })),
          awaitingSignatureCount,
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
            // A refund is a Payment row with a negative amount — the same
            // ledger, running the other way. Saying "paid $-2,500" would be
            // arithmetically true and unreadable.
            ...recentPayments.map((p) => ({
              type: 'payment' as const,
              id: p.id,
              projectId: p.project.id,
              label:
                p.amount < 0
                  ? `${p.project.client.company} refunded on ${p.project.name}`
                  : `${p.project.client.company} paid on ${p.project.name}`,
              preview: `${formatCentsExact(Math.abs(p.amount))} (${p.type})`,
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
