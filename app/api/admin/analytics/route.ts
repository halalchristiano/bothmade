import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { leadConversionRate, winRate } from '@/lib/sales-metrics';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [payments, leads, projects, milestoneStats, clientPayments] = await Promise.all([
      prisma.payment.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { amount: true, createdAt: true, projectId: true },
      }),
      prisma.lead.findMany({
        select: {
          status: true,
          estimatedValue: true,
          proposalTotalPrice: true,
          createdAt: true,
          wonAt: true,
        },
      }),
      prisma.project.findMany({
        select: { id: true, totalPrice: true, baseService: true, addOns: true, clientId: true },
      }),
      // On-time rate, from facts stamped at completion — wasLate is written
      // the moment a milestone is done, so this cannot be rewritten by
      // moving a due date afterwards.
      prisma.milestone.groupBy({
        by: ['wasLate'],
        where: { completedAt: { not: null } },
        _count: true,
      }),
      prisma.payment.groupBy({ by: ['projectId'], _sum: { amount: true } }),
    ]);

    // Revenue by month, last 6 months
    const monthKeys: string[] = [];
    const cursor = new Date(sixMonthsAgo);
    for (let i = 0; i < 6; i++) {
      monthKeys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const revenueByMonth: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));
    for (const p of payments) {
      const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (key in revenueByMonth) revenueByMonth[key] += p.amount;
    }

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    const totalLeads = leads.length;
    const wonLeads = leads.filter((l) => l.status === 'won').length;
    const lostLeads = leads.filter((l) => l.status === 'lost').length;
    const openLeads = totalLeads - wonLeads - lostLeads;
    // Was won/totalLeads as a 0..100 percentage while the dashboard showed
    // won/(won+lost) as a 0..1 fraction, both labelled "Conversion Rate".
    // Both are now computed by lib/sales-metrics.ts, in fractions, and
    // named for what they measure.
    const leadConversion = leadConversionRate(wonLeads, totalLeads);
    const winRateValue = winRate(wonLeads, lostLeads);

    const pipelineValue = leads
      .filter((l) => l.status !== 'won' && l.status !== 'lost')
      .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

    const avgDealSize =
      projects.length > 0
        ? Math.round(projects.reduce((sum, p) => sum + p.totalPrice, 0) / projects.length)
        : 0;

    // ── Revenue by service ────────────────────────────────────────────
    // Real money received, attributed to the project's base service — not
    // list prices, so a discounted deal counts at what it actually paid.
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const revenueByService: Record<string, number> = {};
    for (const pay of payments) {
      const svc = projectById.get(pay.projectId)?.baseService ?? 'unknown';
      revenueByService[svc] = (revenueByService[svc] ?? 0) + pay.amount;
    }

    // ── Add-on attach rates ───────────────────────────────────────────
    // Which add-ons actually sell. Reported as counts, deliberately not as
    // "revenue": a project's payments can't be honestly divided among its
    // add-ons after a discount, and a made-up allocation would read as fact.
    const addOnCounts: Record<string, number> = {};
    for (const proj of projects) {
      for (const key of proj.addOns.split(',').map((a) => a.trim()).filter(Boolean)) {
        addOnCounts[key] = (addOnCounts[key] ?? 0) + 1;
      }
    }

    // ── Sales cycle ───────────────────────────────────────────────────
    // First contact to close, from wonAt — which exists precisely so this
    // number can't drift when someone edits an old deal.
    const cycleDays = leads
      .filter((l) => l.status === 'won' && l.wonAt)
      .map((l) => (l.wonAt!.getTime() - l.createdAt.getTime()) / 86400000)
      .filter((d) => d >= 0);
    const avgSalesCycleDays =
      cycleDays.length > 0
        ? Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length)
        : null;

    // ── On-time delivery ──────────────────────────────────────────────
    const onTime = milestoneStats.find((m) => !m.wasLate)?._count ?? 0;
    const late = milestoneStats.find((m) => m.wasLate)?._count ?? 0;
    const onTimeRate = onTime + late > 0 ? onTime / (onTime + late) : null;

    // ── Client lifetime value ─────────────────────────────────────────
    // Money received per client, averaged. A client with three projects is
    // one client, which is the whole point of the metric.
    const paidByProject = new Map(clientPayments.map((g) => [g.projectId, g._sum.amount ?? 0]));
    const paidByClient = new Map<string, number>();
    for (const proj of projects) {
      const paid = paidByProject.get(proj.id) ?? 0;
      if (paid > 0) paidByClient.set(proj.clientId, (paidByClient.get(proj.clientId) ?? 0) + paid);
    }
    const ltvValues = [...paidByClient.values()];
    const avgClientLtv =
      ltvValues.length > 0
        ? Math.round(ltvValues.reduce((a, b) => a + b, 0) / ltvValues.length)
        : null;

    return NextResponse.json(
      {
        success: true,
        analytics: {
          revenueByMonth,
          totalRevenue,
          totalLeads,
          wonLeads,
          lostLeads,
          openLeads,
          conversionRate: leadConversion,
          leadConversionRate: leadConversion,
          winRate: winRateValue,
          pipelineValue,
          avgDealSize,
          revenueByService,
          addOnCounts,
          avgSalesCycleDays,
          onTimeRate,
          onTimeCounts: { onTime, late },
          avgClientLtv,
          payingClients: ltvValues.length,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
