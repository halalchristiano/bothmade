import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cron-auth';
import { notifyUserFollowUpDigest } from '@/lib/notify';
import { ACTIVE_LEAD_STATUSES } from '@/lib/leads';

/**
 * Runs every weekday morning via Vercel Cron (see vercel.json). Sends each
 * rep a personal digest of just their own overdue/due-today follow-ups —
 * the dashboard's "Do This Next" list only helps if someone opens the
 * dashboard; this reaches them either way.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({ select: { id: true, email: true } });

    let sent = 0;
    for (const user of users) {
      const dueLeads = await prisma.lead.findMany({
        where: {
          assignedToId: user.id,
          status: { in: [...ACTIVE_LEAD_STATUSES] },
          nextFollowUpAt: { lt: endOfToday, not: null },
        },
        orderBy: { nextFollowUpAt: 'asc' },
        select: { id: true, company: true, nextFollowUpAt: true },
      });
      if (dueLeads.length === 0) continue;

      const ok = await notifyUserFollowUpDigest(
        user.email,
        dueLeads.map((l) => ({
          id: l.id,
          company: l.company,
          nextFollowUpAt: l.nextFollowUpAt as Date,
          overdue: (l.nextFollowUpAt as Date) < startOfToday,
        }))
      );
      if (ok) sent += 1;
    }

    return NextResponse.json({ success: true, sent, recipientCount: users.length }, { status: 200 });
  } catch (error) {
    console.error('Follow-up digest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
