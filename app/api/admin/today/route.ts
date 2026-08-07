import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDayStart } from '@/lib/day-window';
import { uninvoicedPayments } from '@/lib/stage-gates';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { MOCKUPS_TO_BUILD_WHERE } from '@/lib/mockups';
import { nextDesignStage } from '@/lib/design-stages';

/**
 * The dashboard, reduced to the three questions a two-person studio actually
 * has each morning: who do I talk to, what money is moving, and what is
 * stuck.
 *
 * One round trip on purpose. The old dashboard fired two heavyweight stats
 * endpoints and rendered roughly twenty cards from them, several of which
 * answered the same question in different words — "Awaiting Signature" and
 * "Contracts Awaiting Signature" were two separate cards on one page. Cards
 * are cheap to add and nobody ever removes one, which is how a landing page
 * stops being somewhere you land.
 *
 * Everything here is a *count plus the first few rows*, because the point is
 * to get someone out of the dashboard and into the work. A dashboard you
 * spend time on is a dashboard that failed.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const now = new Date();
    /*
     * The browser's midnight, not the server's.
     *
     * This used to be `new Date(); setHours(0,0,0,0)` on a server running in
     * UTC, which for anyone working US hours rolls the day over mid-evening:
     * an afternoon of calls counted as yesterday and this page said "1 call
     * logged today" to somebody who had made twelve. See lib/day-window.ts.
     */
    const startOfDay = resolveDayStart(
      new URL(request.url).searchParams.get('dayStart'),
      now
    );
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [
      overdueFollowUps,
      repliedLeads,
      neverContacted,
      openedMockups,
      approvedMockups,
      unsignedProposals,
      dueInstalments,
      gateProjects,
      unpaidInvoices,
      paidThisMonth,
      activeProjects,
      stalledProjects,
      mockupRequests,
      designsOwed,
      mockupsBuiltNotSent,
      unreadDesignFeedback,
      totals,
    ] = await Promise.all([
      prisma.lead.findMany({
        where: { status: { notIn: ['won', 'lost'] }, nextFollowUpAt: { lt: now } },
        orderBy: { nextFollowUpAt: 'asc' },
        take: 5,
        select: { id: true, company: true, phone: true, nextFollowUpAt: true, estimatedValue: true },
      }),
      prisma.lead.count({ where: { status: 'replied' } }),
      prisma.lead.count({
        where: { status: { in: ['new', 'researched'] }, coldEmailSentAt: null, activities: { none: {} } },
      }),

      // The strongest buying signal in the system, and until recently one
      // nobody could see: a prospect who has opened the work built for them.
      prisma.leadMockup
        .findMany({
          where: { status: 'viewed', lead: { status: { notIn: ['won', 'lost'] } } },
          orderBy: { lastViewedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            viewCount: true,
            lastViewedAt: true,
            lead: { select: { id: true, company: true, phone: true } },
          },
        })
        .catch(() => []),
      prisma.leadMockup
        .findMany({
          where: { status: 'approved', lead: { status: { notIn: ['won', 'lost'] } } },
          orderBy: { respondedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            respondedAt: true,
            responseNote: true,
            lead: { select: { id: true, company: true } },
          },
        })
        .catch(() => []),

      /*
       * Proposals out and unsigned, oldest first.
       *
       * Ordered and dated by `contractSentAt` — when the thing actually went
       * out — rather than `updatedAt`, which is when the row was last written
       * by anything. Chasing somebody is a write, so the old number reset to
       * zero on the very act it was meant to prompt: the card said they had
       * just received a proposal they had been sitting on for a fortnight.
       *
       * The sales dashboard was moved onto `contractSentAt` when the column
       * landed and this was missed, so the two pages had started giving
       * different answers to one question about one lead. `updatedAt` remains
       * the fallback for proposals sent before the column existed, matching
       * what sales-stats does, so the two agree on those too.
       */
      prisma.lead.findMany({
        where: { contractStatus: 'sent', status: { notIn: ['won', 'lost'] } },
        orderBy: [{ contractSentAt: 'asc' }, { updatedAt: 'asc' }],
        take: 5,
        select: {
          id: true,
          company: true,
          proposalTotalPrice: true,
          contractSentAt: true,
          updatedAt: true,
        },
      }),

      // Money that has been invoiced and is sitting there.
      prisma.instalment
        .findMany({
          where: { status: 'due' },
          orderBy: { dueAt: 'asc' },
          take: 8,
          select: {
            id: true,
            label: true,
            amountCents: true,
            dueAt: true,
            invoiceNumber: true,
            // Enough to tell "they haven't paid" from "it never arrived" —
            // see readDelivery() in lib/invoice-delivery. The second is a
            // wrong address, and no amount of chasing the first will fix it.
            status: true,
            emailSentAt: true,
            emailOpenedAt: true,
            emailOpens: true,
            linkClickedAt: true,
            linkClicks: true,
            project: { select: { id: true, name: true, client: { select: { company: true } } } },
          },
        })
        .catch(() => []),
      // And money that is waiting on a gate — not owed, but worth knowing the
      // size of, because it is the difference between a good month and a
      // great one.
      /**
       * Every payment past its gate that nobody has invoiced.
       *
       * This used to be an aggregate of every 'scheduled' instalment in the
       * system, which since every project gained a schedule is "the sum of
       * all money not yet collected on all live work" — a number that goes up
       * when you win business and means nothing on a dashboard. What matters
       * is the far smaller set the studio has already EARNED and simply never
       * asked for. See uninvoicedPayments() in lib/stage-gates.
       */
      prisma.project
        .findMany({
          where: { status: { not: 'complete' } },
          select: {
            id: true,
            name: true,
            statusStage: true,
            designApprovedAt: true,
            client: { select: { company: true } },
            instalments: {
              where: { status: 'scheduled' },
              select: { id: true, index: true, label: true, amountCents: true, trigger: true, status: true },
            },
          },
        })
        .catch(() => []),

      // 'open' is the only unpaid state an Invoice has — it goes open → paid.
      // There is no 'sent' or 'overdue', and asking for those would have made
      // this panel permanently, silently empty.
      prisma.invoice.findMany({
        where: { status: 'open' },
        orderBy: { createdAt: 'asc' },
        take: 5,
        select: {
          id: true,
          number: true,
          description: true,
          amountCents: true,
          createdAt: true,
          client: { select: { company: true } },
          project: { select: { id: true } },
        },
      }),
      prisma.payment.aggregate({
        where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
        _sum: { amount: true },
      }),

      prisma.project.count({ where: { status: { not: 'complete' } } }),
      prisma.project.findMany({
        where: { status: { not: 'complete' }, updatedAt: { lt: weekAgo } },
        orderBy: { updatedAt: 'asc' },
        take: 5,
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
          client: { select: { company: true } },
        },
      }),

      // The same clause the Mockups page lists, so the badge and the page it
      // links to can never disagree.
      prisma.lead.count({ where: MOCKUPS_TO_BUILD_WHERE }),

      /**
       * A design the client has answered, waiting on us to send the next
       * round.
       *
       * Presented, then their feedback cleared the deadline — so their review
       * clock has stopped, and the payment gate behind Design Approval has
       * stopped with it. Nothing chases us for this, which is exactly why it
       * belongs at the top of the screen rather than inside a project.
       */
      prisma.project
        .findMany({
          where: {
            designPresentedAt: { not: null },
            designReviewEndsAt: null,
            designApprovedAt: null,
            status: { not: 'complete' },
          },
          orderBy: { updatedAt: 'asc' },
          take: 5,
          select: {
            id: true,
            designRound: true,
            updatedAt: true,
            client: { select: { company: true } },
          },
        })
        .catch(() => []),

      /**
       * Work that is finished and sitting there.
       *
       * The folder is put together, the link goes on the lead, and then the
       * send waits on somebody remembering to do it. It is the cheapest
       * thing in the pipeline to fix and the easiest to lose: nothing is
       * blocked, nobody is chasing, and the lead just quietly ages with its
       * mockup undelivered. Counted on the folder rather than the preview
       * build, because the preview is never sent to anyone.
       */
      prisma.lead
        .findMany({
          where: {
            mockupFolderUrl: { not: null },
            doNotContact: false,
            status: { notIn: ['won', 'lost'] },
            mockups: { none: { sentAt: { not: null } } },
          },
          orderBy: { updatedAt: 'asc' },
          take: 5,
          select: { id: true, company: true, email: true, updatedAt: true },
        })
        .catch(() => []),

      /**
       * Design feedback nobody here has read yet.
       *
       * The one thing in the delivery lane that is genuinely blocking: the
       * client has stopped, told us in detail what they want, and their
       * review clock has stopped with them. Every day this sits unread is a
       * day the project does not move and the next payment gate stays shut.
       */
      prisma.designFeedback
        .findMany({
          where: { reviewedAt: null },
          orderBy: { createdAt: 'asc' },
          take: 5,
          select: {
            id: true,
            round: true,
            createdAt: true,
            consumedRound: true,
            project: { select: { id: true, name: true, client: { select: { company: true } } } },
          },
        })
        .catch(() => []),

      /*
       * The real sizes of the lists above.
       *
       * Every list here is capped — five rows, eight for the money — because
       * this card is a summary and a summary that renders four hundred rows
       * is a list. The caps were fine. What was not fine is that the page
       * then counted the capped arrays and printed the answer as a total:
       * "5 follow-ups are overdue" to somebody with thirty, and — worse — a
       * sum of at most eight instalments announced as everything invoiced
       * and unpaid.
       *
       * Under-reporting a backlog is the one direction a dashboard must not
       * round in. It reads as "nearly caught up" and it is the opposite.
       */
      Promise.all([
        prisma.lead.count({
          where: { status: { notIn: ['won', 'lost'] }, nextFollowUpAt: { lt: now } },
        }),
        prisma.lead.count({ where: { contractStatus: 'sent', status: { notIn: ['won', 'lost'] } } }),
        prisma.leadMockup
          .count({ where: { status: 'approved', lead: { status: { notIn: ['won', 'lost'] } } } })
          .catch(() => 0),
        prisma.lead
          .count({
            where: {
              mockupFolderUrl: { not: null },
              doNotContact: false,
              status: { notIn: ['won', 'lost'] },
              mockups: { none: { sentAt: { not: null } } },
            },
          })
          .catch(() => 0),
        prisma.designFeedback.count({ where: { reviewedAt: null } }).catch(() => 0),
        prisma.project.count({ where: { status: { not: 'complete' }, updatedAt: { lt: weekAgo } } }),
        prisma.invoice.count({ where: { status: 'open' } }),
        // Count and sum together: the headline states both, and reading them
        // off a page of eight rows understated the money as well as the count.
        prisma.instalment
          .aggregate({ where: { status: 'due' }, _count: true, _sum: { amountCents: true } })
          .catch(() => ({ _count: 0, _sum: { amountCents: 0 } })),
      ]).then(
        ([
          overdueFollowUpCount,
          unsignedProposalCount,
          approvedMockupCount,
          mockupsBuiltNotSentCount,
          unreadDesignFeedbackCount,
          stalledProjectCount,
          unpaidInvoiceCount,
          due,
        ]) => ({
          overdueFollowUpCount,
          unsignedProposalCount,
          approvedMockupCount,
          mockupsBuiltNotSentCount,
          unreadDesignFeedbackCount,
          stalledProjectCount,
          unpaidInvoiceCount,
          dueInstalmentCount: due._count,
          dueInstalmentTotalCents: due._sum.amountCents ?? 0,
        })
      ),
    ]);

    const callsToday = await prisma.leadActivity.count({
      where: { type: 'call', createdAt: { gte: startOfDay } },
    });

    /*
     * What each person actually got through, and what came of it.
     *
     * A single team-wide "12 calls logged" cannot answer the question anybody
     * running a two-person sales floor asks, which is not "how many calls"
     * but "how did that go, and for whom". So each row carries the three
     * things a call can turn into: it happened, they wanted a mockup, or they
     * did not and the follow-up sequence picked them up.
     *
     * Read off the activity log rather than counted per-metric, because the
     * activity IS the attribution — a mockup request and a booked sequence
     * have no author of their own, but the call that caused them does. One
     * query, and the numbers cannot disagree with each other because they are
     * all derived from the same rows.
     */
    const callRows = await prisma.leadActivity.findMany({
      where: { type: { in: ['call', 'dial'] }, createdAt: { gte: startOfDay } },
      select: {
        type: true,
        createdById: true,
        createdBy: { select: { name: true, email: true } },
        lead: {
          select: {
            id: true,
            mockupRequestedAt: true,
            autoFollowUpDueAt: true,
            autoFollowUpStage: true,
          },
        },
      },
    });

    const byPerson = new Map<
      string,
      {
        userId: string;
        name: string;
        calls: number;
        dials: number;
        mockups: Set<string>;
        sequence: Set<string>;
      }
    >();

    for (const row of callRows) {
      const key = row.createdById ?? 'unknown';
      const entry =
        byPerson.get(key) ??
        {
          userId: key,
          // Falls back to the address, then to something honest, rather than
          // rendering a blank row that reads as a bug.
          name: row.createdBy?.name || row.createdBy?.email || 'Someone',
          calls: 0,
          dials: 0,
          mockups: new Set<string>(),
          sequence: new Set<string>(),
        };

      /*
       * Two numbers that must never be added together.
       *
       * `dials` is what the machine saw: a number tapped, recorded before the
       * phone app took the screen, with nothing to press and no way to skip
       * it. `calls` is what somebody wrote down afterwards. They answer
       * different questions — "how much work happened" and "how much of it
       * came back as information" — and the gap between them is the only
       * thing on this dashboard nobody could see before.
       */
      if (row.type === 'dial') {
        entry.dials++;
        byPerson.set(key, entry);
        continue;
      }
      entry.calls++;
      // Sets, not counters: two calls to the same business in one day is one
      // mockup, and counting it twice would flatter the number.
      if (row.lead?.mockupRequestedAt && row.lead.mockupRequestedAt >= startOfDay) {
        entry.mockups.add(row.lead.id);
      } else if (row.lead?.autoFollowUpDueAt && row.lead.autoFollowUpStage === 0) {
        entry.sequence.add(row.lead.id);
      }
      byPerson.set(key, entry);
    }

    const team = [...byPerson.values()]
      .map((p) => ({
        userId: p.userId,
        name: p.name,
        calls: p.calls,
        dials: p.dials,
        mockupsRequested: p.mockups.size,
        intoFollowUp: p.sequence.size,
      }))
      // By dials, because that is the number nobody typed. Sorting by
      // self-reported outcomes would put whoever writes the most notes at the
      // top of a board about who does the most work.
      .sort((a, b) => b.dials - a.dials || b.calls - a.calls);

    // Summed before the slice. The headline announces this figure as all the
    // money past its gate and never invoiced; totalling the eight rows it
    // happens to show made that sentence understate itself.
    const allUninvoiced = uninvoicedPayments(gateProjects);
    const uninvoiced = allUninvoiced.slice(0, 8);

    return NextResponse.json(
      {
        success: true,
        sell: {
          overdueFollowUps,
          // What the lists above are pages OF. Anything the page states as a
          // total reads one of these, never `list.length`.
          overdueFollowUpCount: totals.overdueFollowUpCount,
          unsignedProposalCount: totals.unsignedProposalCount,
          approvedMockupCount: totals.approvedMockupCount,
          repliedCount: repliedLeads,
          neverContactedCount: neverContacted,
          openedMockups,
          approvedMockups,
          unsignedProposals,
          callsToday,
          /*
           * Everybody's day, not just the viewer's — deliberately the same
           * numbers on every account. Two people working one book need to be
           * looking at one scoreboard, or "how are we doing" has two answers
           * and neither of them is the truth.
           */
          team,
        },
        money: {
          dueInstalments,
          // Earned, and never asked for. The only kind of missing revenue
          // that is entirely ours to fix, and it does not announce itself.
          uninvoiced,
          uninvoicedCount: allUninvoiced.length,
          uninvoicedTotalCents: allUninvoiced.reduce((sum, u) => sum + u.amountCents, 0),
          unpaidInvoices,
          unpaidInvoiceCount: totals.unpaidInvoiceCount,
          dueInstalmentCount: totals.dueInstalmentCount,
          dueInstalmentTotalCents: totals.dueInstalmentTotalCents,
          collectedThisMonthCents: paidThisMonth._sum.amount ?? 0,
        },
        deliver: {
          activeProjects,
          stalledProjects,
          mockupRequests,
          // Named with the round the client is waiting for, so the dashboard
          // can say "owes Revision 1" rather than "owes a design".
          designsOwed: designsOwed.map((p) => ({
            id: p.id,
            company: p.client.company,
            since: p.updatedAt,
            nextStage: nextDesignStage(p.designRound).label,
          })),
          mockupsBuiltNotSent,
          mockupsBuiltNotSentCount: totals.mockupsBuiltNotSentCount,
          stalledProjectCount: totals.stalledProjectCount,
          // Blocking, and silent until now: their clock has stopped and the
          // project cannot move until somebody here reads this.
          unreadDesignFeedback,
          unreadDesignFeedbackCount: totals.unreadDesignFeedbackCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Today dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
