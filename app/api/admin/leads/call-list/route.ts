import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

/**
 * The day's call list, in the order it should be worked.
 *
 * The leads list answers "what have we got"; this answers "who do I ring
 * next", which is a different question and the one a rep asks every morning.
 * Ordering is deliberate:
 *
 *  1. Bounced email — the only way to reach these is the phone, and they're
 *     currently the easiest leads to forget entirely because nothing failed
 *     visibly.
 *  2. Follow-up overdue — a promise already broken, and the fastest way to
 *     lose a warm lead.
 *  3. Follow-up due today.
 *  4. Contacted by email, never rung, no follow-up booked — the pile that
 *     silently accumulates.
 *  5. Never contacted at all.
 *
 * Won and lost are excluded. Leads with no phone number are returned
 * separately rather than dropped, so it's obvious they need an address
 * finding rather than looking like they don't exist.
 */
// High enough that a real book of business fits comfortably, low enough to
// stay a cheap query. Truncation is reported rather than hidden.
const MAX_ROWS = 2000;

export type CallReason = 'bounced' | 'overdue' | 'today' | 'no-follow-up' | 'never-contacted';

const REASON_RANK: Record<CallReason, number> = {
  bounced: 0,
  overdue: 1,
  today: 2,
  'no-follow-up': 3,
  'never-contacted': 4,
};

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });

    // A rep works their own leads; an owner sees everything.
    const scope = user?.role === 'sales' ? { assignedToId: session.userId } : {};

    const where = { ...scope, status: { notIn: ['won', 'lost'] } };

    // Counted separately so the page can say how many were considered. A list
    // that silently shows a subset reads as "this is everything", which is the
    // worst possible failure for a work queue.
    const totalOpen = await prisma.lead.count({ where });

    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        company: true,
        contactName: true,
        phone: true,
        email: true,
        status: true,
        hotLead: true,
        estimatedValue: true,
        nextFollowUpAt: true,
        emailDeliveryFailedAt: true,
        emailDeliveryFailedReason: true,
        coldEmailSentAt: true,
        salesNote: true,
        updatedAt: true,
        assignedTo: { select: { name: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { type: true, content: true, createdAt: true },
        },
      },
      // Ordered so that if the cap is ever reached, what survives is what
      // matters: bounced first, then whoever has been waiting longest.
      // Without an orderBy, Postgres returns an arbitrary set — which meant a
      // lead could appear one day and silently vanish the next.
      orderBy: [
        { emailDeliveryFailedAt: { sort: 'desc', nulls: 'last' } },
        { nextFollowUpAt: { sort: 'asc', nulls: 'last' } },
        { updatedAt: 'asc' },
      ],
      take: MAX_ROWS,
    });

    // Compare on date, not timestamp — a follow-up set for "today" shouldn't
    // read as overdue just because it was stored at midnight.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const rows = leads.map((lead) => {
      let reason: CallReason;
      if (lead.emailDeliveryFailedAt) reason = 'bounced';
      else if (lead.nextFollowUpAt && lead.nextFollowUpAt < startOfToday) reason = 'overdue';
      else if (lead.nextFollowUpAt && lead.nextFollowUpAt < endOfToday) reason = 'today';
      else if (!lead.nextFollowUpAt && (lead.coldEmailSentAt || lead.status !== 'new')) reason = 'no-follow-up';
      else reason = 'never-contacted';

      return { ...lead, reason, lastActivity: lead.activities[0] ?? null, activities: undefined };
    });

    // A follow-up that's due is due whether or not it's in the future, so
    // anything scheduled beyond today stays out of the list entirely.
    const due = rows.filter(
      (r) => !(r.reason === 'never-contacted' && r.nextFollowUpAt && r.nextFollowUpAt >= endOfToday)
    );

    due.sort((a, b) => {
      const byReason = REASON_RANK[a.reason] - REASON_RANK[b.reason];
      if (byReason !== 0) return byReason;
      if (a.hotLead !== b.hotLead) return a.hotLead ? -1 : 1;
      // Oldest follow-up first within a band — the longest-waiting lead is
      // the one most at risk.
      const at = a.nextFollowUpAt?.getTime() ?? Infinity;
      const bt = b.nextFollowUpAt?.getTime() ?? Infinity;
      if (at !== bt) return at - bt;
      return (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0);
    });

    return NextResponse.json(
      {
        success: true,
        callable: due.filter((r) => r.phone),
        noPhone: due.filter((r) => !r.phone),
        // What the numbers on screen actually mean.
        totalOpen,
        scheduledLater: leads.length - due.length,
        truncated: leads.length >= MAX_ROWS,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Call list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
