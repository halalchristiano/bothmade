import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { projectBalance } from '@/lib/billing';
import { requireCronAuth } from '@/lib/cron-auth';
import { getDigestRecipientEmails } from '@/lib/notify';
import { sendWeeklyDigestEmail } from '@/lib/email';

const STALE_DAYS = 7;

/**
 * Runs every Friday via Vercel Cron (see vercel.json). Same signing check
 * as the other cron routes — Vercel's own header, reject anyone else.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

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
        select: {
          id: true,
          totalPrice: true,
          statusStage: true,
          updatedAt: true,
          payments: { select: { amount: true, type: true } },
          instalments: { select: { status: true, amountCents: true, trigger: true } },
        },
      }),
    ]);

    const wonValueThisWeek = wonThisWeek.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
    const revenueThisMonth = paymentsThisMonth.reduce((sum, p) => sum + p.amount, 0);
    const atRiskProjects = activeProjects.filter((p) => p.updatedAt < staleThreshold).length;
    // Money actually invoiced and unpaid. Counting everything not yet paid on
    // the contract would report every live project as an overdue balance, in
    // an email whose whole job is to say what needs chasing.
    const overdueBalances = activeProjects.filter((p) => projectBalance(p).dueNowCents > 0).length;

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
