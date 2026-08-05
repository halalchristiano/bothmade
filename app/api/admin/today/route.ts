import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uninvoicedPayments } from '@/lib/stage-gates';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

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
export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
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

      prisma.lead.findMany({
        where: { contractStatus: 'sent', status: { notIn: ['won', 'lost'] } },
        orderBy: { updatedAt: 'asc' },
        take: 5,
        select: { id: true, company: true, proposalTotalPrice: true, updatedAt: true },
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

      prisma.lead.count({ where: { mockupRequested: true, mockupUrl: null } }),
    ]);

    const callsToday = await prisma.leadActivity.count({
      where: { type: 'call', createdAt: { gte: startOfDay } },
    });

    const uninvoiced = uninvoicedPayments(gateProjects).slice(0, 8);

    return NextResponse.json(
      {
        success: true,
        sell: {
          overdueFollowUps,
          repliedCount: repliedLeads,
          neverContactedCount: neverContacted,
          openedMockups,
          approvedMockups,
          unsignedProposals,
          callsToday,
        },
        money: {
          dueInstalments,
          // Earned, and never asked for. The only kind of missing revenue
          // that is entirely ours to fix, and it does not announce itself.
          uninvoiced,
          uninvoicedTotalCents: uninvoiced.reduce((sum, u) => sum + u.amountCents, 0),
          unpaidInvoices,
          collectedThisMonthCents: paidThisMonth._sum.amount ?? 0,
        },
        deliver: {
          activeProjects,
          stalledProjects,
          mockupRequests,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Today dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
