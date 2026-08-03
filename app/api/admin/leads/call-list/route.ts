import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { startOfBusinessDay } from '@/lib/business-time';
import { unauthorizedResponse } from '@/lib/middleware';
import { cadenceStepFor } from '@/lib/cadence';
import { isGoogleOAuthConfigured } from '@/lib/gmail-oauth';

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

/**
 * Why a lead is on the list — or, for `scheduled`, why it isn't.
 *
 * Every open lead resolves to exactly one of these, and the counts add up to
 * the total. The rules are checked in this order and the first match wins, so
 * no lead can qualify for two and none can fall through to a default.
 */
export type CallReason =
  /** They wrote back. Nothing outranks this. */
  | 'replied'
  | 'bounced'
  | 'overdue'
  | 'today'
  | 'no-follow-up'
  | 'never-contacted'
  /** Booked for a future date — deliberately not callable today. */
  | 'scheduled';

const REASON_RANK: Record<CallReason, number> = {
  replied: 0,
  bounced: 1,
  overdue: 2,
  today: 3,
  'no-follow-up': 4,
  'never-contacted': 5,
  scheduled: 6,
};

/** The bands that make up the call list. `scheduled` is counted, not called. */
const CALLABLE_REASONS: CallReason[] = [
  'replied',
  'bounced',
  'overdue',
  'today',
  'no-follow-up',
  'never-contacted',
];

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, googleRefreshToken: true, gmailNeedsReconnect: true },
    });

    // A rep works their own leads *and* whatever nobody has claimed; an
    // owner sees everything.
    //
    // Scoping to assignedToId alone meant a CSV import — which lands
    // unassigned, or assigned to whoever ran it — never reached the rep's
    // call list at all. Eight hundred researched leads could sit in the
    // database completely invisible to the person whose job is ringing
    // them. This matches how /api/admin/sales-stats has always defined
    // "my leads"; the two disagreeing is what hid it.
    const scope =
      user?.role === 'sales'
        ? { OR: [{ assignedToId: session.userId }, { assignedToId: null }] }
        : {};

    const where = {
      ...scope,
      status: { notIn: ['won', 'lost'] },
      // A number that has been marked wrong or dead is not a number. These
      // were redialled every single morning, ahead of leads with a working
      // one, because nothing recorded that the call had already been tried
      // and failed.
      phoneInvalid: false,
    };

    // Counted separately so the page can say how many were considered. A list
    // that silently shows a subset reads as "this is everything", which is the
    // worst possible failure for a work queue.
    const totalOpen = await prisma.lead.count({ where });

    // Calls logged today, by this person. A rep working a long list has no
    // sense of progress otherwise — the list only ever shows what's left.
    // The rep's day, not the server's: at UTC-5 a call logged after 7pm
    // counted toward tomorrow and the day's tally read zero all evening.
    const startOfDay = startOfBusinessDay();
    const callsToday = await prisma.leadActivity.count({
      where: { type: 'call', createdById: session.userId, createdAt: { gte: startOfDay } },
    });

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
        replyReceivedAt: true,
        phoneInvalid: true,
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
        { replyReceivedAt: { sort: 'desc', nulls: 'last' } },
        { emailDeliveryFailedAt: { sort: 'desc', nulls: 'last' } },
        { nextFollowUpAt: { sort: 'asc', nulls: 'last' } },
        { updatedAt: 'asc' },
      ],
      take: MAX_ROWS,
    });

    // Compare on date, not timestamp — a follow-up set for "today" shouldn't
    // read as overdue just because it was stored at midnight.
    const startOfToday = startOfBusinessDay();
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    // Outreach emails already sent, per lead, in one query — this is what
    // positions each lead in the follow-up cadence.
    const emailCounts = await prisma.leadActivity.groupBy({
      by: ['leadId'],
      where: { leadId: { in: leads.map((l) => l.id) }, type: 'email' },
      _count: true,
    });
    const emailCountByLead = new Map(emailCounts.map((g) => [g.leadId, g._count]));

    const rows = leads.map((lead) => {
      // "Contacted" means anyone actually reached out — an email that went, or
      // any logged activity. Reading status alone called a lead that had been
      // rung twice "not contacted yet", because nothing had moved its stage.
      const hasBeenContacted =
        !!lead.coldEmailSentAt || lead.activities.length > 0 || lead.status !== 'new';

      // First match wins, and the branches are exhaustive — every lead gets
      // exactly one reason, so the counts below can be trusted to add up.
      let reason: CallReason;
      if (lead.replyReceivedAt) {
        // Outranks a booked follow-up: they've moved, so the old plan is stale.
        reason = 'replied';
      } else if (lead.emailDeliveryFailedAt) {
        reason = 'bounced'; // email can't reach them at all, so the date is moot
      } else if (lead.nextFollowUpAt && lead.nextFollowUpAt < startOfToday) {
        reason = 'overdue';
      } else if (lead.nextFollowUpAt && lead.nextFollowUpAt < endOfToday) {
        reason = 'today';
      } else if (lead.nextFollowUpAt) {
        reason = 'scheduled'; // booked beyond today
      } else if (hasBeenContacted) {
        reason = 'no-follow-up';
      } else {
        reason = 'never-contacted';
      }

      // Which cadence email is due next, so the rep opens the composer on
      // the right template instead of working out the sequence position by
      // reading the timeline.
      const emailsSent = emailCountByLead.get(lead.id) ?? 0;
      const nextCadenceStep =
        (reason === 'overdue' || reason === 'today' || reason === 'no-follow-up') && !lead.replyReceivedAt
          ? cadenceStepFor(emailsSent + 1)
          : null;

      return {
        ...lead,
        reason,
        nextCadenceStep,
        lastActivity: lead.activities[0] ?? null,
        activities: undefined,
      };
    });

    // Every reason is counted, including the one that keeps a lead off the
    // list, so the page can show a breakdown that reconciles with the total.
    const breakdown = Object.fromEntries(
      ([...CALLABLE_REASONS, 'scheduled'] as CallReason[]).map((r) => [
        r,
        rows.filter((x) => x.reason === r).length,
      ])
    ) as Record<CallReason, number>;

    const due = rows.filter((r) => r.reason !== 'scheduled');

    // Hot leads booked for later are correctly excluded from today's call
    // list — but "not on the list" shouldn't mean "invisible". A rep glancing
    // at their day should still see the big ones coming up.
    const scheduledHot = rows
      .filter((r) => r.reason === 'scheduled' && r.hotLead)
      .sort((a, b) => (a.nextFollowUpAt?.getTime() ?? Infinity) - (b.nextFollowUpAt?.getTime() ?? Infinity))
      .slice(0, 20);

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
        scheduledHot,
        // What the numbers on screen actually mean.
        totalOpen,
        callsToday,
        breakdown,
        scheduledLater: breakdown.scheduled,
        noPhoneCount: due.filter((r) => !r.phone).length,
        truncated: leads.length >= MAX_ROWS,
        // The banner's "one tap" reconnect button can't do anything when the
        // deployment has no OAuth credentials — without this it promised a
        // fix it couldn't deliver and dead-ended whoever tapped it.
        googleOAuthAvailable: isGoogleOAuthConfigured(),
        gmailStatus: !user?.googleRefreshToken
          ? 'not-connected'
          : user.gmailNeedsReconnect
            ? 'needs-reconnect'
            : 'ok',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Call list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
