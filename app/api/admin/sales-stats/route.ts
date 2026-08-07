import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { resolveDayStart } from '@/lib/day-window';
import { ACTIVE_LEAD_STATUSES, LEAD_STATUS_SHORT_LABELS } from '@/lib/leads';

// Late-funnel stages where a stall is expensive — worth a tighter SLA than
// the generic 5-day "stale" threshold that covers every active stage.
const LATE_FUNNEL_STATUSES = ['proposal_sent', 'verbal_yes', 'contract_sent', 'deposit_pending'];
const LATE_FUNNEL_STALL_DAYS = 3;

// Rough probability-to-close per stage, used only for the weighted forecast.
const STAGE_WEIGHT: Record<string, number> = {
  new: 0.05,
  researched: 0.08,
  contacted: 0.12,
  replied: 0.18,
  qualified: 0.25,
  discovery_scheduled: 0.32,
  discovery_done: 0.4,
  mockup_prep: 0.45,
  presented: 0.55,
  proposal_sent: 0.65,
  verbal_yes: 0.8,
  contract_sent: 0.85,
  contract_signed: 0.92,
  deposit_pending: 0.95,
};
const ACTIVE_STATUSES: string[] = [...ACTIVE_LEAD_STATUSES];

export type StatsRange = 'week' | 'month' | 'quarter';

const RANGE_LABELS: Record<StatsRange, string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'This Quarter',
};

export function getPeriodStart(range: StatsRange, now: Date): Date {
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'quarter') return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range');
    const range: StatsRange = rangeParam === 'month' || rangeParam === 'quarter' ? rangeParam : 'week';

    const now = new Date();
    /*
     * The browser's midnight, not the server's — the same fix `/api/admin/today`
     * already carries, and for the same reason (see lib/day-window.ts).
     *
     * This endpoint feeds the "Do This Next" card, so a UTC boundary on a
     * server running UTC moved a US rep's day over four hours early: at 8pm
     * Eastern everything due today flipped to red "Overdue", and anything
     * they'd set for later that evening landed in tomorrow's UTC day — past
     * `endOfToday`, not yet before `startOfToday`, so it appeared in neither
     * list. A follow-up that silently isn't on the list is the one failure
     * this card cannot have.
     */
    const startOfToday = resolveDayStart(searchParams.get('dayStart'), now);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const periodStart = getPeriodStart(range, now);
    const staleThreshold = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // "My" leads: assigned to me, or unassigned (so nothing falls through the cracks).
    const mine = { OR: [{ assignedToId: session.userId }, { assignedToId: null }] };

    /*
     * One pass over the leads, thirteen columns of the hundred-odd on the
     * row.
     *
     * This was four queries: every lead, then every won lead, then every lost
     * lead, then a count of the ones created this period. `mine` carries no
     * status filter, so the won and lost queries were re-fetching rows the
     * first query had already returned — the same table walked three times to
     * produce three views of one result set, and a fourth time to count a
     * subset of it. Everything downstream is JS filtering over the whole
     * list anyway, so the split bought nothing.
     *
     * Selecting explicitly matters as much as the query count here: a Lead
     * carries notes, pain points, the address block and the whole enrichment
     * side, none of which this endpoint reads. Dragging all of it across the
     * wire once per dashboard open, per range change, was the bulk of the cost.
     */
    const [allMine, activityInPeriod] = await Promise.all([
      prisma.lead.findMany({
        where: mine,
        select: {
          id: true,
          company: true,
          status: true,
          source: true,
          estimatedValue: true,
          email: true,
          phone: true,
          hotLead: true,
          lostReason: true,
          nextFollowUpAt: true,
          contractStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.leadActivity.count({
        where: { createdAt: { gte: periodStart }, createdById: session.userId },
      }),
    ]);

    const wonAllTime = allMine.filter((l) => l.status === 'won');
    const lostAllTime = allMine.filter((l) => l.status === 'lost');
    const newInPeriod = allMine.filter((l) => l.createdAt >= periodStart).length;

    const pipeline = ACTIVE_STATUSES.map((status) => {
      const leads = allMine.filter((l) => l.status === status);
      const value = leads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
      return { status, count: leads.length, value };
    });

    const weightedForecast = pipeline.reduce(
      (sum, p) => sum + p.value * (STAGE_WEIGHT[p.status] || 0),
      0
    );

    const wonInPeriod = wonAllTime.filter((l) => l.updatedAt >= periodStart);
    const revenueInPeriod = wonInPeriod.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

    const closedTotal = wonAllTime.length + lostAllTime.length;
    const conversionRate = closedTotal > 0 ? wonAllTime.length / closedTotal : 0;
    const avgDealSize =
      wonAllTime.length > 0
        ? Math.round(wonAllTime.reduce((s, l) => s + (l.estimatedValue || 0), 0) / wonAllTime.length)
        : 0;

    const lostInPeriod = lostAllTime.filter((l) => l.updatedAt >= periodStart);
    const lostReasonCounts: Record<string, number> = {};
    for (const l of lostInPeriod) {
      const reason = l.lostReason?.trim() || 'No reason recorded';
      lostReasonCounts[reason] = (lostReasonCounts[reason] || 0) + 1;
    }

    const active = allMine.filter((l) => ACTIVE_STATUSES.includes(l.status));
    const hotLeads = active.filter((l) => l.hotLead);
    const followUpsToday = active.filter(
      (l) => l.nextFollowUpAt && l.nextFollowUpAt >= startOfToday && l.nextFollowUpAt < endOfToday
    );
    const followUpsOverdue = active.filter((l) => l.nextFollowUpAt && l.nextFollowUpAt < startOfToday);
    const staleLeads = active.filter((l) => l.updatedAt < staleThreshold);

    const lateFunnelStallThreshold = new Date(now.getTime() - LATE_FUNNEL_STALL_DAYS * 24 * 60 * 60 * 1000);
    const stageAging = active.filter(
      (l) => LATE_FUNNEL_STATUSES.includes(l.status) && l.updatedAt < lateFunnelStallThreshold
    );

    // Contracts sitting with the client, unsigned — the one thing on a
    // closer's own deals that needs chasing but wouldn't otherwise surface
    // until it's already gone stale by the generic 5-day check.
    const awaitingSignature = active
      .filter((l) => l.contractStatus === 'sent')
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

    const leadsInPeriod = allMine.filter((l) => l.createdAt >= periodStart);
    const sourceMap: Record<string, { total: number; won: number }> = {};
    for (const l of leadsInPeriod) {
      const source = l.source?.trim() || 'Unknown';
      if (!sourceMap[source]) sourceMap[source] = { total: 0, won: 0 };
      sourceMap[source].total += 1;
      if (l.status === 'won') sourceMap[source].won += 1;
    }
    const sourcePerformance = Object.entries(sourceMap)
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.total - a.total);

    const clientTypeBreakdown: Record<string, number> = {};
    for (const l of active) {
      // clientType isn't stored on Lead directly (it's chosen at proposal time), so this buckets by estimated value tiers instead.
      const tier = !l.estimatedValue
        ? 'unscoped'
        : l.estimatedValue < 500000
        ? 'startup-tier'
        : l.estimatedValue < 1500000
        ? 'smb-tier'
        : 'enterprise-tier';
      clientTypeBreakdown[tier] = (clientTypeBreakdown[tier] || 0) + 1;
    }

    return NextResponse.json(
      {
        success: true,
        stats: {
          pipeline,
          weightedForecast,
          totalPipelineValue: pipeline.reduce((s, p) => s + p.value, 0),
          range,
          periodLabel: RANGE_LABELS[range],
          thisWeek: {
            newLeads: newInPeriod,
            activityLogged: activityInPeriod,
            won: wonInPeriod.length,
            revenue: revenueInPeriod,
          },
          conversionRate,
          avgDealSize,
          lostReasonCounts,
          hotLeads: hotLeads.map((l) => ({ id: l.id, company: l.company, estimatedValue: l.estimatedValue, phone: l.phone, email: l.email })),
          followUpsToday: followUpsToday.map((l) => ({ id: l.id, company: l.company, phone: l.phone, email: l.email })),
          followUpsOverdue: followUpsOverdue.map((l) => ({ id: l.id, company: l.company, nextFollowUpAt: l.nextFollowUpAt, phone: l.phone, email: l.email })),
          staleLeads: staleLeads.map((l) => ({ id: l.id, company: l.company, updatedAt: l.updatedAt, phone: l.phone, email: l.email })),
          stageAging: stageAging.map((l) => ({
            id: l.id,
            company: l.company,
            estimatedValue: l.estimatedValue,
            phone: l.phone,
            email: l.email,
            stageLabel: LEAD_STATUS_SHORT_LABELS[l.status as keyof typeof LEAD_STATUS_SHORT_LABELS] || l.status,
            daysIdle: Math.floor((now.getTime() - l.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
          })),
          awaitingSignature: awaitingSignature.map((l) => ({
            id: l.id,
            company: l.company,
            phone: l.phone,
            email: l.email,
            daysWaiting: Math.floor((now.getTime() - l.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
          })),
          sourcePerformance,
          clientTypeBreakdown,
          wonDeals: wonAllTime
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, 50)
            .map((l) => ({ id: l.id, company: l.company, value: l.estimatedValue || 0, wonAt: l.updatedAt })),
          totalWonValue: wonAllTime.reduce((s, l) => s + (l.estimatedValue || 0), 0),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get sales stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
