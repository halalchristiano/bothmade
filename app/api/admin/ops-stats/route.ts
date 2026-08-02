import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { getPeriodStart, type StatsRange } from '@/app/api/admin/sales-stats/route';

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
        },
      }),
      prisma.project.findMany({
        where: { createdAt: { gte: periodStart } },
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

    const atRiskProjects = activeProjects
      .filter((p) => p.updatedAt < staleThreshold)
      .map((p) => ({
        id: p.id,
        name: p.name,
        company: p.client.company,
        status: p.status,
        updatedAt: p.updatedAt,
        daysSinceUpdate: Math.floor((now.getTime() - p.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
      }))
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

    const overdueBalances = await Promise.all(
      activeProjects.map(async (p) => {
        const paid = await prisma.payment.aggregate({
          where: { projectId: p.id },
          _sum: { amount: true },
        });
        const amountPaid = paid._sum.amount || 0;
        const balanceDue = p.totalPrice - amountPaid;
        return { id: p.id, name: p.name, company: p.client.company, balanceDue, statusStage: p.statusStage };
      })
    );
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
          newHandoffs: newHandoffs.map((p) => ({
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
          overdueBalances: overdueBalances.filter((p) => p.balanceDue > 0).sort((a, b) => b.balanceDue - a.balanceDue),
          projectsAwaitingReply,
          awaitingSignature: awaitingSignature.map((l) => ({ id: l.id, company: l.company, updatedAt: l.updatedAt })),
          pendingMockups: pendingMockups.map((l) => ({ id: l.id, company: l.company, mockupRequestedAt: l.mockupRequestedAt })),
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
