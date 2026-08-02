import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { ACTIVE_LEAD_STATUSES } from '@/lib/leads';

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
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range');
    const range: StatsRange = rangeParam === 'month' || rangeParam === 'quarter' ? rangeParam : 'week';

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const periodStart = getPeriodStart(range, now);
    const staleThreshold = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // "My" leads: assigned to me, or unassigned (so nothing falls through the cracks).
    const mine = { OR: [{ assignedToId: session.userId }, { assignedToId: null }] };

    const [allMine, wonAllTime, lostAllTime, newInPeriod, activityInPeriod] = await Promise.all([
      prisma.lead.findMany({ where: mine }),
      prisma.lead.findMany({ where: { ...mine, status: 'won' } }),
      prisma.lead.findMany({ where: { ...mine, status: 'lost' } }),
      prisma.lead.count({ where: { ...mine, createdAt: { gte: periodStart } } }),
      prisma.leadActivity.count({
        where: { createdAt: { gte: periodStart }, createdById: session.userId },
      }),
    ]);

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

    const lostReasonCounts: Record<string, number> = {};
    for (const l of lostAllTime) {
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

    const sourceMap: Record<string, { total: number; won: number }> = {};
    for (const l of allMine) {
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
          sourcePerformance,
          clientTypeBreakdown,
          wonDeals: wonAllTime
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, 15)
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
