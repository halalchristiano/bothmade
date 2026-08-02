import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDigestRecipientEmails } from '@/lib/notify';
import { sendWeeklyDigestEmail } from '@/lib/email';

const STALE_DAYS = 7;

/**
 * Runs every Friday via Vercel Cron (see vercel.json). Same signing check
 * as the other cron routes — Vercel's own header, reject anyone else.
 */
export async function GET(request: NextRequest) {
  // Fail closed: reject if CRON_SECRET is unset rather than running open.
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const staleThreshold = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [newLeadsThisWeek, wonThisWeek, paymentsThisMonth, overdueFollowUps, activeProjects] = await Promise.all([
      prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.lead.findMany({ where: { status: 'won', updatedAt: { gte: weekAgo } }, select: { estimatedValue: true } }),
      prisma.payment.findMany({ where: { createdAt: { gte: startOfMonth } }, select: { amount: true } }),
      prisma.lead.count({
        where: { status: { notIn: ['won', 'lost'] }, nextFollowUpAt: { lt: now } },
      }),
      prisma.project.findMany({
        where: { status: { not: 'complete' } },
        select: { id: true, totalPrice: true, updatedAt: true, payments: { select: { amount: true } } },
      }),
    ]);

    const wonValueThisWeek = wonThisWeek.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
    const revenueThisMonth = paymentsThisMonth.reduce((sum, p) => sum + p.amount, 0);
    const atRiskProjects = activeProjects.filter((p) => p.updatedAt < staleThreshold).length;
    const overdueBalances = activeProjects.filter(
      (p) => p.totalPrice - p.payments.reduce((s, pay) => s + pay.amount, 0) > 0
    ).length;

    const emails = await getDigestRecipientEmails();
    const sent = await sendWeeklyDigestEmail(emails, {
      newLeadsThisWeek,
      wonThisWeek: wonThisWeek.length,
      wonValueThisWeek,
      revenueThisMonth,
      overdueFollowUps,
      overdueBalances,
      atRiskProjects,
    });

    return NextResponse.json({ success: true, sent, recipientCount: emails.length }, { status: 200 });
  } catch (error) {
    console.error('Weekly digest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
