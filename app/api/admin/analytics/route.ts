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

    const [payments, leads, projects] = await Promise.all([
      prisma.payment.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { amount: true, createdAt: true },
      }),
      prisma.lead.findMany({ select: { status: true, estimatedValue: true } }),
      prisma.project.findMany({ select: { totalPrice: true } }),
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
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
