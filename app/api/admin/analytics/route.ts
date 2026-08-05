import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import {
  analyticsRangeStart,
  billingThisMonthCents,
  conversionRate,
  dealValueCents,
  dealValueIsFirm,
  isAnalyticsRange,
  lostReasonBreakdown,
  monthBuckets,
  monthKey,
  runRateCents,
  type AnalyticsRange,
} from '@/lib/reporting';

/**
 * The studio's numbers.
 *
 * The arithmetic lives in lib/reporting.ts and is tested there; this route is
 * the queries and nothing else. Two things it now does that it didn't:
 *
 * It counts care plans. Recurring revenue was invisible here — a whole
 * product line billing every month, in no total and no chart — because the
 * only table anyone thought to read was `payments`.
 *
 * And it respects a date range. Every figure was all-time, which meant none
 * of them could answer "is this quarter better than last".
 */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    // Every staff account sees the studio's numbers — the same explicit
    // check the rest of the money routes carry, rather than an implicit one.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range');
    const range: AnalyticsRange = isAnalyticsRange(rangeParam) ? rangeParam : '12mo';

    const now = new Date();
    const rangeStart = analyticsRangeStart(range, now);
    const buckets = monthBuckets(rangeStart, now);
    // Fetch from whichever is earlier: the start of the range (which the
    // totals filter on) or the first bar on the chart. The two are not the
    // same window — a 30-day range reaches back into last month, while a
    // 12-month chart is capped at twelve bars however far the range goes —
    // and fetching from the later of the two silently drops rows from
    // whichever one needed them.
    const chartStart = new Date(now.getFullYear(), now.getMonth() - (buckets.length - 1), 1);
    const moneyStart = rangeStart && rangeStart < chartStart ? rangeStart : chartStart;
    const inRange = rangeStart ? { gte: rangeStart } : undefined;

    const [oneOffPayments, recurringPayments, leads, activePlans] = await Promise.all([
      prisma.payment.findMany({
        where: { createdAt: { gte: moneyStart } },
        select: { amount: true, type: true, createdAt: true },
      }),
      prisma.recurringPayment.findMany({
        where: { createdAt: { gte: moneyStart } },
        select: { amount: true, createdAt: true },
      }),
      prisma.lead.findMany({
        select: {
          id: true,
          status: true,
          estimatedValue: true,
          proposalTotalPrice: true,
          lostReason: true,
          updatedAt: true,
        },
      }),
      prisma.recurringOffer.findMany({
        where: { status: 'active' },
        select: {
          acceptedAt: true,
          monthlyCents: true,
          discountType: true,
          discountValue: true,
          freeMonths: true,
          discountMonths: true,
        },
      }),
    ]);

    // What each lead actually sold for, where it became a project.
    const converted = await prisma.project.findMany({
      where: { convertedFromLeadId: { in: leads.map((l) => l.id) } },
      select: { convertedFromLeadId: true, totalPrice: true },
    });
    const soldFor = new Map<string, number>();
    for (const p of converted) {
      if (p.convertedFromLeadId) soldFor.set(p.convertedFromLeadId, p.totalPrice);
    }

    // --- Money ------------------------------------------------------------
    // Revenue counts every payment type, including one-off `custom` charges.
    // That is the opposite of the balance calculation, deliberately: a change
    // request the client paid for is real income, it just isn't income
    // against the project's contracted price.
    const countedOneOff = inRange ? oneOffPayments.filter((p) => p.createdAt >= inRange.gte) : oneOffPayments;
    const countedRecurring = inRange
      ? recurringPayments.filter((p) => p.createdAt >= inRange.gte)
      : recurringPayments;

    const oneOffCents = countedOneOff.reduce((sum, p) => sum + p.amount, 0);
    const recurringCents = countedRecurring.reduce((sum, p) => sum + p.amount, 0);

    const byMonth = new Map(buckets.map((b) => [b.key, { oneOff: 0, recurring: 0 }]));
    for (const p of oneOffPayments) {
      const bucket = byMonth.get(monthKey(p.createdAt));
      if (bucket) bucket.oneOff += p.amount;
    }
    for (const p of recurringPayments) {
      const bucket = byMonth.get(monthKey(p.createdAt));
      if (bucket) bucket.recurring += p.amount;
    }

    const mrrCents = activePlans.reduce((sum, plan) => sum + billingThisMonthCents(plan, now), 0);

    // --- Deals ------------------------------------------------------------
    // `updatedAt` is the closest thing to a decision date the schema has. It
    // is what the sales dashboard already uses, so the two pages agree.
    const decidedInRange = (lead: { status: string; updatedAt: Date }) =>
      (lead.status === 'won' || lead.status === 'lost') && (!inRange || lead.updatedAt >= inRange.gte);

    const won = leads.filter((l) => l.status === 'won' && decidedInRange(l));
    const lost = leads.filter((l) => l.status === 'lost' && decidedInRange(l));
    const open = leads.filter((l) => l.status !== 'won' && l.status !== 'lost');

    const wonValueCents = won.reduce((sum, l) => sum + dealValueCents(l, soldFor), 0);
    const avgDealCents = won.length > 0 ? Math.round(wonValueCents / won.length) : 0;

    const pipelineCents = open.reduce((sum, l) => sum + dealValueCents(l, soldFor), 0);
    // How much of the pipeline figure rests on a guess, said out loud. A
    // total that silently mixes signed numbers with typed-in ones invites
    // more confidence than it has earned.
    const pipelineUnpriced = open.filter((l) => dealValueCents(l, soldFor) === 0).length;
    const pipelineEstimated = open.filter(
      (l) => dealValueCents(l, soldFor) > 0 && !dealValueIsFirm(l, soldFor)
    ).length;

    return NextResponse.json(
      {
        success: true,
        analytics: {
          range,
          revenue: {
            oneOffCents,
            recurringCents,
            totalCents: oneOffCents + recurringCents,
            byMonth: buckets.map((b) => ({
              label: b.label,
              oneOff: byMonth.get(b.key)?.oneOff ?? 0,
              recurring: byMonth.get(b.key)?.recurring ?? 0,
            })),
          },
          recurring: {
            activePlans: activePlans.length,
            mrrCents,
            runRateCents: runRateCents(activePlans),
          },
          deals: {
            won: won.length,
            lost: lost.length,
            open: open.length,
            conversionRate: conversionRate(won.length, lost.length),
            wonValueCents,
            avgDealCents,
          },
          pipeline: {
            valueCents: pipelineCents,
            estimatedCount: pipelineEstimated,
            unpricedCount: pipelineUnpriced,
          },
          lostReasons: lostReasonBreakdown(lost),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
