import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import {
  businessDateParts,
  startOfBusinessDay,
  startOfBusinessDayOffset,
  startOfBusinessMonth,
  startOfBusinessMonthOffset,
} from '@/lib/business-time';
import { dealValue, leadConversionRate, winRate, wonDate } from '@/lib/sales-metrics';
import { unauthorizedResponse } from '@/lib/middleware';
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

/**
 * Period boundaries in the studio's timezone, not the server's.
 *
 * These were `new Date(y, m, 1)`, which uses the server's zone — UTC on
 * Vercel. At UTC-5 that puts the month boundary at 7pm on the last evening
 * of the previous month, so an evening's work landed in the wrong month
 * every month, and "this month's revenue" was wrong for five hours a day.
 */
export function getPeriodStart(range: StatsRange, now: Date): Date {
  if (range === 'month') return startOfBusinessMonth(now);
  if (range === 'quarter') {
    const { month } = businessDateParts(now);
    // Back up to the first month of this quarter, then take its start.
    return startOfBusinessMonthOffset((month - 1) % 3, now);
  }
  return startOfBusinessDayOffset(7, now);
}

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range');
    const range: StatsRange = rangeParam === 'month' || rangeParam === 'quarter' ? rangeParam : 'week';

    const now = new Date();
    const startOfToday = startOfBusinessDay(now);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const periodStart = getPeriodStart(range, now);
    const staleThreshold = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // "My" leads: assigned to me, or unassigned (so nothing falls through the cracks).
    const mine = { OR: [{ assignedToId: session.userId }, { assignedToId: null }] };

    // Three full-row loads of the same table, then filtered in JS — the
    // won and lost sets are subsets of the first, and every row came back
    // with all forty-odd columns including the long research text fields.
    // One query, the columns actually used, partitioned in memory.
    //
    // Kept as a load rather than pushed fully into groupBy because the
    // period and stage arithmetic below needs per-row dates; the win is
    // dropping two redundant queries and the text columns, which is where
    // the payload actually was.
    const [allMine, newInPeriod, activityInPeriod] = await Promise.all([
      prisma.lead.findMany({
        where: mine,
        select: {
          id: true,
          company: true,
          status: true,
          estimatedValue: true,
          proposalTotalPrice: true,
          hotLead: true,
          phone: true,
          email: true,
          source: true,
          lostReason: true,
          nextFollowUpAt: true,
          contractStatus: true,
          replyReceivedAt: true,
          proposalClientType: true,
          wonAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.lead.count({ where: { ...mine, createdAt: { gte: periodStart } } }),
      prisma.leadActivity.count({
        where: { createdAt: { gte: periodStart }, createdById: session.userId },
      }),
    ]);

    const wonAllTime = allMine.filter((l) => l.status === 'won');
    const lostAllTime = allMine.filter((l) => l.status === 'lost');

    const pipeline = ACTIVE_STATUSES.map((status) => {
      const leads = allMine.filter((l) => l.status === status);
      // The agreed price wins over the early guess once there is one.
      const value = leads.reduce((sum, l) => sum + dealValue(l), 0);
      return { status, count: leads.length, value };
    });

    const weightedForecast = pipeline.reduce(
      (sum, p) => sum + p.value * (STAGE_WEIGHT[p.status] || 0),
      0
    );

    // Closed *when*, not last-edited-when. Filtering on updatedAt meant
    // editing a note on a deal won in March moved it into this month's
    // revenue, which is precisely why the sales and ops figures never
    // reconciled.
    const wonInPeriod = wonAllTime.filter((l) => wonDate(l) >= periodStart);
    const revenueInPeriod = wonInPeriod.reduce((sum, l) => sum + dealValue(l), 0);

    // Two named metrics rather than one ambiguous "conversion rate". See
    // lib/sales-metrics.ts — these were computed differently on two screens
    // and shown under the same label.
    const winRateValue = winRate(wonAllTime.length, lostAllTime.length);
    const leadConversion = leadConversionRate(wonAllTime.length, allMine.length);

    const avgDealSize =
      wonAllTime.length > 0
        ? Math.round(wonAllTime.reduce((s, l) => s + dealValue(l), 0) / wonAllTime.length)
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
          // Kept under the old key so nothing breaks, but it is the win
          // rate and is now labelled as such in the UI.
          conversionRate: winRateValue,
          winRate: winRateValue,
          leadConversionRate: leadConversion,
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
            .sort((a, b) => wonDate(b).getTime() - wonDate(a).getTime())
            .slice(0, 50)
            .map((l) => ({ id: l.id, company: l.company, value: dealValue(l), wonAt: wonDate(l) })),
          totalWonValue: wonAllTime.reduce((s, l) => s + dealValue(l), 0),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get sales stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
