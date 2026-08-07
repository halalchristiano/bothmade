import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isGoogleOAuthConfigured } from '@/lib/gmail-oauth';
import { readOpens } from '@/lib/lead-opens';
import { nextTouch } from '@/lib/next-touch';
import { resolveDayStart } from '@/lib/day-window';

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
   * A mockup has gone out and nobody has rung about it. The most valuable
   * call on the sheet: work has been done, it has been delivered, and the
   * only thing between it and a decision is somebody asking what they thought.
   */
  | 'mockup-sent'
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
  /**
   * A mockup was asked for and has not gone out yet. Held back, like
   * `scheduled` — you promised these people something and it isn't ready, so
   * there is nothing to say until it is.
   */
  | 'awaiting-mockup'
  /** Booked for a future date — deliberately not callable today. */
  | 'scheduled';

const REASON_RANK: Record<CallReason, number> = {
  replied: 0,
  'mockup-sent': 1,
  opened: 2,
  bounced: 3,
  overdue: 4,
  today: 5,
  'no-follow-up': 6,
  'never-contacted': 7,
  'awaiting-mockup': 8,
  scheduled: 9,
};

/**
 * The bands that make up the call list.
 *
 * `scheduled` and `awaiting-mockup` are counted rather than called — one is
 * booked for a date that hasn't arrived, the other is waiting on work that
 * hasn't been delivered.
 */
const CALLABLE_REASONS: CallReason[] = [
  'replied',
  'mockup-sent',
  'opened',
  'bounced',
  'overdue',
  'today',
  'no-follow-up',
  'never-contacted',
];

/** Counted and reported, deliberately kept off today's sheet. */
const HELD_BACK_REASONS: CallReason[] = ['awaiting-mockup', 'scheduled'];

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { googleRefreshToken: true, gmailNeedsReconnect: true },
    });

    /*
     * One sheet, everybody's leads.
     *
     * This used to scope a `sales` rep to their own assigned leads, which
     * sounds tidy and was wrong for a team of two working the same book: the
     * strongest lead on any given morning — somebody reading the email right
     * now — was invisible to whoever happened to be free to ring it, because
     * of an assignment made weeks earlier by whoever imported the CSV. Two
     * partial lists also meant neither person could tell whether the queue was
     * genuinely empty or merely empty of theirs.
     *
     * Who owns a lead is still on the row, so the sheet reads "Evan's" or
     * "Kiana's" at a glance. It just no longer decides who is allowed to see
     * it.
     */
    const where = { status: { notIn: ['won', 'lost'] } };

    // Counted separately so the page can say how many were considered. A list
    // that silently shows a subset reads as "this is everything", which is the
    // worst possible failure for a work queue.
    const totalOpen = await prisma.lead.count({ where });

    /*
     * Calls logged today, by this person. A rep working a long list has no
     * sense of progress otherwise — the list only ever shows what's left.
     *
     * "Today" is the browser's day, not the server's. Computed here in UTC it
     * rolled over mid-evening for anyone working US hours, so an afternoon of
     * calls read as zero. See lib/day-window.ts.
     */
    const startOfDay = resolveDayStart(new URL(request.url).searchParams.get('dayStart'));
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
        // Filterable on the page: a rep working a morning of med spas reuses
        // the same pitch twenty times, which is worth more than working the
        // list in whatever order it arrived.
        industry: true,
        // Territory. A rep working the phone books a morning by state far more
        // often than by anything else, and "sensible hour there" answers a
        // different question — it says when, not where.
        region: true,
        coldEmailOpenedAt: true,
        coldEmailLastOpenedAt: true,
        salesNote: true,
        updatedAt: true,
        // Whether a mockup is owed, and whether it has gone out. These decide
        // two whole bands, and they are different facts: `mockupRequested`
        // means somebody asked for one, `mockupSentManuallyAt` and a stamped
        // mockup row mean the client has actually received it. Delivered by
        // hand counts — the work reached them, which is the only thing the
        // band is about.
        mockupRequested: true,
        mockupSentManuallyAt: true,
        // What is already scheduled for this lead, so the row can say so.
        // Four separate facts decide whether a lead is handled and they used
        // to live in four places; see lib/next-touch.ts.
        autoFollowUpDueAt: true,
        autoFollowUpStage: true,
        mockups: {
          where: { sentAt: { not: null } },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { sentAt: true },
        },
        assignedTo: { select: { name: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { type: true, content: true, createdAt: true },
        },
        // Counted rather than inferred from `activities`, which only carries
        // the single most recent row: a lead rung twice and then emailed looks
        // never-rung through that window. This is the number "not tried yet"
        // has to be built on.
        _count: { select: { activities: { where: { type: 'call' } } } },
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

    /*
     * When each of these was last rung, in one query.
     *
     * Needed for exactly one decision: a mockup that has gone out is the best
     * reason to ring anybody, but only until somebody has rung. Without this
     * the band would either stick forever — the same twelve names every
     * morning, long after the conversation happened — or be gated on a
     * follow-up date and so miss the two days when the mockup is fresh.
     *
     * The single `activities` row already selected above cannot answer it: it
     * is the most recent activity of ANY type, so a lead rung on Monday and
     * emailed on Tuesday looks unrung.
     */
    const lastCallByLead = new Map<string, Date>();
    if (leads.length > 0) {
      const calls = await prisma.leadActivity.groupBy({
        by: ['leadId'],
        where: { type: 'call', leadId: { in: leads.map((l) => l.id) } },
        _max: { createdAt: true },
      });
      for (const c of calls) {
        if (c._max.createdAt) lastCallByLead.set(c.leadId, c._max.createdAt);
      }
    }

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

      /*
       * Where this lead sits in the mockup half of the pipeline.
       *
       * `mockupSentAt` is when the client received one — a stamped send or a
       * hand-delivery, never merely a link being attached. A preview
       * deployment sitting on our own machine is not something anybody has
       * been given, and calling to ask what they thought of it is the exact
       * embarrassment this distinction exists to prevent.
       */
      const mockupSentAt = lead.mockups[0]?.sentAt ?? lead.mockupSentManuallyAt ?? null;
      const awaitingMockup = lead.mockupRequested && !mockupSentAt;

      /*
       * Sent, and not rung since.
       *
       * The "not rung since" half is what stops this being a band that never
       * empties. Ringing about the mockup is the whole job; once it has
       * happened the outcome books a date and the ordinary follow-up bands
       * take it from there.
       */
      const lastCall = lastCallByLead.get(lead.id) ?? null;
      const mockupNeedsCall =
        !!mockupSentAt && (!lastCall || lastCall.getTime() < mockupSentAt.getTime());

      // First match wins, and the branches are exhaustive — every lead gets
      // exactly one reason, so the counts below can be trusted to add up.
      let reason: CallReason;
      if (lead.replyReceivedAt) {
        // Outranks a booked follow-up: they've moved, so the old plan is stale.
        reason = 'replied';
      } else if (awaitingMockup) {
        /*
         * Promised something, hasn't got it yet. Off the sheet.
         *
         * Checked this high on purpose — above an open, above a bounce, above
         * an overdue date. All of those normally mean "ring them", and every
         * one of them is wrong here: there is nothing to say to somebody
         * waiting on work that isn't finished, and ringing anyway is how a
         * warm lead is talked back out of interest. A reply is the one thing
         * that outranks it, because a lead who has written to us is no longer
         * waiting quietly.
         */
        reason = 'awaiting-mockup';
      } else if (mockupNeedsCall) {
        /*
         * They have it and nobody has rung. Above the booked-date bands on
         * purpose: the follow-up date was chosen during a call that happened
         * before the mockup existed, so it is a plan made without the single
         * most important fact. Sitting on it until Thursday wastes the two
         * days when the thing you built is still on their desk.
         */
        reason = 'mockup-sent';
      } else if (opens.callable) {
        // Any open, above the follow-up bands deliberately: this is evidence
        // from this morning and it goes cold in days, where a date in a diary
        // is a plan that will keep. Ranked inside the band by how strong the
        // evidence is — repeat readers first, a single fetch on delivery
        // last — so "opened" never means one thing on screen and another in
        // the ordering.
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

      /*
       * Emailed, and not one open on it. What the section heading has always
       * said, and now what it actually holds.
       *
       * This used to lean on `callable` while `callable` excluded a single
       * open, so a business that HAD opened the email sat in a list titled
       * "Emailed, nobody has opened it" — off the sheet, and the heading was
       * wrong about it. Zero opens is the only thing that belongs here.
       */
      const emailedAndUnopened =
        !!lead.coldEmailSentAt &&
        opens.opens === 0 &&
        (reason === 'no-follow-up' || reason === 'never-contacted');

      return {
        ...lead,
        reason,
        /*
         * One sentence saying what happens to this lead next.
         *
         * Computed here rather than on the page so the row, the call screen
         * and the lead page cannot disagree about it — and so the state
         * nobody could see before, "nothing is scheduled and nobody is coming
         * back to this", has somewhere to be said out loud.
         */
        nextTouch: nextTouch({
          reason,
          nextFollowUpAt: lead.nextFollowUpAt,
          autoFollowUpDueAt: lead.autoFollowUpDueAt,
          autoFollowUpStage: lead.autoFollowUpStage,
          mockupRequested: lead.mockupRequested,
          mockupSentAt,
        }),
        emailedAndUnopened,
        opens: opens.opens,
        openBand: opens.band,
        openHeadline: opens.headline,
        openNextStep: opens.nextStep,
        openScore: opens.score,
        timesCalled: lead._count.activities,
        lastActivity: lead.activities[0] ?? null,
        activities: undefined,
        _count: undefined,
      };
    });

    const due = rows.filter((r) => !HELD_BACK_REASONS.includes(r.reason));

    // Split before anything is counted, so nothing that comes off the sheet
    // can still be counted onto it further down.
    const noSignal = due.filter((r) => r.emailedAndUnopened);
    const worthCalling = due.filter((r) => !r.emailedAndUnopened);

    // Counted from what is actually shown. The breakdown drives the filter
    // chips, and a chip reading "Contacted, nothing booked (212)" over a list
    // of nine is the kind of quiet lie that makes a rep stop trusting the
    // page — the ones held back are reported as their own number instead.
    const breakdown = Object.fromEntries(
      ([...CALLABLE_REASONS, ...HELD_BACK_REASONS] as CallReason[]).map((r) => [
        r,
        HELD_BACK_REASONS.includes(r)
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
        /*
         * Waiting on a mockup. Reported rather than listed, for the same
         * reason `scheduled` is: an empty-looking sheet with twelve leads
         * quietly held back is a sheet nobody believes. This number is also
         * the honest read on the design queue — if it climbs, the bottleneck
         * is not the phone.
         */
        awaitingMockup: breakdown['awaiting-mockup'],
        /*
         * Automated emails going out over the next week.
         *
         * The one thing about this system nobody could see: it writes to
         * customers on your behalf. A number you can look at is the
         * difference between automation you trust and automation you are
         * quietly nervous about.
         */
        autoEmailsThisWeek: rows.filter(
          (r) =>
            r.autoFollowUpDueAt &&
            r.autoFollowUpDueAt <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        ).length,
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
