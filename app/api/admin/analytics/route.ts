import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { requireRole, OPS } from '@/lib/authz';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }
    const denied = requireRole(session, OPS);
    if (denied) return denied;

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
    const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;

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
          conversionRate,
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
