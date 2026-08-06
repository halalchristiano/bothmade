import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isGoogleOAuthConfigured } from '@/lib/gmail-oauth';
import { readOpens } from '@/lib/lead-opens';

/**
 * The day's call list, in the order it should be worked.
 *
 * The leads list answers "what have we got"; this answers "who do I ring
 * next", which is a different question and the one a rep asks every morning.
 * Ordering is deliberate:
 *
 *  1. Opened the cold email more than once — they are reading it right now
 *     and have not written back. The strongest buying signal short of a
 *     reply, and it decays within days.
 *  2. Bounced email — the only way to reach these is the phone, and they're
 *     currently the easiest leads to forget entirely because nothing failed
 *     visibly.
 *  3. Follow-up overdue — a promise already broken, and the fastest way to
 *     lose a warm lead.
 *  4. Follow-up due today.
 *  5. Contacted by email, never rung, no follow-up booked — the pile that
 *     silently accumulates.
 *  6. Never contacted at all.
 *
 * Won and lost are excluded. Leads with no phone number are returned
 * separately rather than dropped, so it's obvious they need an address
 * finding rather than looking like they don't exist.
 *
 * ## What is deliberately NOT on it
 *
 * A lead that was emailed and has never been opened by a person. Those used
 * to sit in the "contacted, nothing booked" band and made up most of the
 * sheet — hundreds of dials into businesses with no evidence anybody has even
 * seen the message. They are returned as `noSignal` instead: counted, listed,
 * one click from being worked, and off the list of people to ring today.
 *
 * The exceptions stay callable, because for them a missing open means nothing:
 * a lead that replied, one whose address bounced (the phone is the only way
 * in), one with a follow-up you promised, and one that was never emailed at
 * all.
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
  /**
   * They keep opening the email. Ranked above a booked follow-up on purpose:
   * a date in a diary is a plan, and somebody reading your email this morning
   * is happening now. See lib/lead-opens.ts for why one open does not qualify.
   */
  | 'opened'
  | 'bounced'
  | 'overdue'
  | 'today'
  | 'no-follow-up'
  | 'never-contacted'
  /** Booked for a future date — deliberately not callable today. */
  | 'scheduled';

const REASON_RANK: Record<CallReason, number> = {
  replied: 0,
  opened: 1,
  bounced: 2,
  overdue: 3,
  today: 4,
  'no-follow-up': 5,
  'never-contacted': 6,
  scheduled: 7,
};

/** The bands that make up the call list. `scheduled` is counted, not called. */
const CALLABLE_REASONS: CallReason[] = [
  'replied',
  'opened',
  'bounced',
  'overdue',
  'today',
  'no-follow-up',
  'never-contacted',
];

export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, googleRefreshToken: true, gmailNeedsReconnect: true },
    });

    // A rep works their own leads; an owner sees everything.
    const scope = user?.role === 'sales' ? { assignedToId: session.userId } : {};

    const where = { ...scope, status: { notIn: ['won', 'lost'] } };

    // Counted separately so the page can say how many were considered. A list
    // that silently shows a subset reads as "this is everything", which is the
    // worst possible failure for a work queue.
    const totalOpen = await prisma.lead.count({ where });

    // Calls logged today, by this person. A rep working a long list has no
    // sense of progress otherwise — the list only ever shows what's left.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
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
        phoneInvalidAt: true,
        replyReceivedAt: true,
        emailDeliveryFailedReason: true,
        coldEmailSentAt: true,
        coldEmailOpens: true,
        coldEmailOpenedAt: true,
        coldEmailLastOpenedAt: true,
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
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const rows = leads.map((lead) => {
      // "Contacted" means anyone actually reached out — an email that went, or
      // any logged activity. Reading status alone called a lead that had been
      // rung twice "not contacted yet", because nothing had moved its stage.
      const hasBeenContacted =
        !!lead.coldEmailSentAt || lead.activities.length > 0 || lead.status !== 'new';

      // What the pixel says about this one. Derived, never stored — the
      // wording on the row and the position in the queue come from the same
      // call, so they cannot drift apart.
      const opens = readOpens(lead);

      // First match wins, and the branches are exhaustive — every lead gets
      // exactly one reason, so the counts below can be trusted to add up.
      let reason: CallReason;
      if (lead.replyReceivedAt) {
        // Outranks a booked follow-up: they've moved, so the old plan is stale.
        reason = 'replied';
      } else if (opens.band === 'hot' || opens.band === 'engaged') {
        // Above the follow-up bands deliberately: this is evidence from this
        // morning, and it goes cold in days.
        reason = 'opened';
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

      // Emailed, and no person has opened it. Not a call — evidence of
      // nothing, and the whole reason the sheet was too long to work.
      const emailedAndUnopened =
        !!lead.coldEmailSentAt &&
        !opens.callable &&
        (reason === 'no-follow-up' || reason === 'never-contacted');

      return {
        ...lead,
        reason,
        emailedAndUnopened,
        opens: opens.opens,
        openBand: opens.band,
        openHeadline: opens.headline,
        openNextStep: opens.nextStep,
        openScore: opens.score,
        lastActivity: lead.activities[0] ?? null,
        activities: undefined,
      };
    });

    const due = rows.filter((r) => r.reason !== 'scheduled');

    // Split before anything is counted, so nothing that comes off the sheet
    // can still be counted onto it further down.
    const noSignal = due.filter((r) => r.emailedAndUnopened);
    const worthCalling = due.filter((r) => !r.emailedAndUnopened);

    // Counted from what is actually shown. The breakdown drives the filter
    // chips, and a chip reading "Contacted, nothing booked (212)" over a list
    // of nine is the kind of quiet lie that makes a rep stop trusting the
    // page — the ones held back are reported as their own number instead.
    const breakdown = Object.fromEntries(
      ([...CALLABLE_REASONS, 'scheduled'] as CallReason[]).map((r) => [
        r,
        r === 'scheduled'
          ? rows.filter((x) => x.reason === r).length
          : worthCalling.filter((x) => x.reason === r).length,
      ])
    ) as Record<CallReason, number>;

    // Hot leads booked for later are correctly excluded from today's call
    // list — but "not on the list" shouldn't mean "invisible". A rep glancing
    // at their day should still see the big ones coming up.
    const scheduledHot = rows
      .filter((r) => r.reason === 'scheduled' && r.hotLead)
      .sort((a, b) => (a.nextFollowUpAt?.getTime() ?? Infinity) - (b.nextFollowUpAt?.getTime() ?? Infinity))
      .slice(0, 20);

    worthCalling.sort((a, b) => {
      const byReason = REASON_RANK[a.reason] - REASON_RANK[b.reason];
      if (byReason !== 0) return byReason;
      // Inside the opened band, most-opened first — that is the whole point
      // of the band. Applied before hotLead, because a hand-set flag is
      // somebody's opinion from last week and this is what happened today.
      if (a.reason === 'opened' && b.reason === 'opened' && a.openScore !== b.openScore) {
        return b.openScore - a.openScore;
      }
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
        // A dead/wrong number is as good as no number for calling — keep it
        // out of the callable list so nobody re-dials it, but still surface it
        // under "can't reach" so it doesn't silently vanish and can be given a
        // new number.
        callable: worthCalling.filter((r) => r.phone && !r.phoneInvalidAt),
        noPhone: worthCalling.filter((r) => !r.phone || r.phoneInvalidAt),
        /*
         * Emailed and unopened. Off the sheet, not out of the system: a rep
         * who wants to work them can, and the count is what tells you whether
         * a batch landed at all. A hundred of these in one morning is a
         * deliverability problem, not a hundred bad prospects.
         */
        noSignal,
        noSignalCount: noSignal.length,
        scheduledHot,
        // What the numbers on screen actually mean.
        totalOpen,
        callsToday,
        breakdown,
        scheduledLater: breakdown.scheduled,
        noPhoneCount: worthCalling.filter((r) => !r.phone || r.phoneInvalidAt).length,
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
