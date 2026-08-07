import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Today } from '@/components/admin/dashboard/Today';

/**
 * The dashboard counted the page and called it the total.
 *
 * Every list behind this card is capped — five rows, eight for the money —
 * because a summary that renders four hundred rows is a list. The caps were
 * right. Counting the capped array and printing the answer as a total was
 * not: somebody with thirty overdue follow-ups was told they had five, and a
 * sum of at most eight instalments was announced as everything invoiced and
 * unpaid.
 *
 * Under-reporting a backlog is the one direction a dashboard must not round
 * in. "5 overdue" reads as nearly caught up. Thirty is not nearly caught up,
 * and the number is the only thing on the card anybody reads at a glance.
 */

const router = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const EMPTY = {
  sell: {
    overdueFollowUps: [],
    overdueFollowUpCount: 0,
    unsignedProposalCount: 0,
    approvedMockupCount: 0,
    repliedCount: 0,
    neverContactedCount: 0,
    openedMockups: [],
    approvedMockups: [],
    unsignedProposals: [],
    callsToday: 0,
    team: [],
  },
  money: {
    dueInstalments: [],
    dueInstalmentCount: 0,
    dueInstalmentTotalCents: 0,
    uninvoiced: [],
    uninvoicedCount: 0,
    uninvoicedTotalCents: 0,
    unpaidInvoices: [],
    unpaidInvoiceCount: 0,
    collectedThisMonthCents: 0,
  },
  deliver: {
    activeProjects: 0,
    stalledProjects: [],
    stalledProjectCount: 0,
    mockupRequests: 0,
    designsOwed: [],
    mockupsBuiltNotSent: [],
    mockupsBuiltNotSentCount: 0,
    unreadDesignFeedback: [],
    unreadDesignFeedbackCount: 0,
  },
};

const fetchMock = vi.fn();
const serve = (body: unknown) =>
  fetchMock.mockImplementation(async () =>
    ({ ok: true, status: 200, json: async () => ({ success: true, ...(body as object) }) }) as unknown as Response
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

/** A page of five follow-ups, out of `total` that actually exist. */
const followUpPage = (total: number) => ({
  ...EMPTY,
  sell: {
    ...EMPTY.sell,
    overdueFollowUpCount: total,
    overdueFollowUps: Array.from({ length: Math.min(total, 5) }, (_, i) => ({
      id: `lead_${i}`,
      company: `Co ${i}`,
      phone: null,
      nextFollowUpAt: null,
      estimatedValue: null,
    })),
  },
});

describe('the headline', () => {
  it('reports every overdue follow-up, not the five it can show', async () => {
    serve(followUpPage(30));
    render(<Today />);
    await screen.findByText('30 follow-ups are overdue.');
  });

  it('still reads naturally when there is exactly one', async () => {
    serve(followUpPage(1));
    render(<Today />);
    await screen.findByText('1 follow-up is overdue.');
  });

  /**
   * The worst of them: a money figure. Eight rows summed and announced as
   * everything invoiced and unpaid understated what the studio is owed.
   */
  it('sums every unpaid instalment, not the eight it can show', async () => {
    serve({
      ...EMPTY,
      money: {
        ...EMPTY.money,
        dueInstalmentCount: 14,
        dueInstalmentTotalCents: 4_212_00,
        dueInstalments: Array.from({ length: 8 }, (_, i) => ({
          id: `inst_${i}`,
          label: 'Deposit',
          amountCents: 100_00,
          dueAt: null,
          invoiceNumber: null,
          status: 'due',
          emailSentAt: null,
          emailOpenedAt: null,
          emailOpens: 0,
          linkClickedAt: null,
          linkClicks: 0,
          project: { id: `p_${i}`, name: 'Site', client: { company: `Co ${i}` } },
        })),
      },
    });

    render(<Today />);

    // £4,212 across 14 — not the £800 across 8 that is on screen.
    await screen.findByText('$4,212 invoiced and unpaid across 14 payments.');
  });

  it('counts every client waiting on a design read', async () => {
    serve({
      ...EMPTY,
      deliver: {
        ...EMPTY.deliver,
        unreadDesignFeedbackCount: 9,
        unreadDesignFeedback: Array.from({ length: 5 }, (_, i) => ({
          id: `fb_${i}`,
          round: 1,
          createdAt: new Date().toISOString(),
          consumedRound: false,
          project: { id: `p_${i}`, name: 'Site', client: { company: `Co ${i}` } },
        })),
      },
    });

    render(<Today />);

    await screen.findByText('9 clients have sent design feedback nobody has read.');
  });
});

describe('a lane showing a page', () => {
  it('says how much it is not showing', async () => {
    serve(followUpPage(30));
    render(<Today />);
    await screen.findByText('25 more →');
  });

  it('says nothing when the lane is showing everything', async () => {
    serve(followUpPage(3));
    render(<Today />);
    await screen.findByText('3 follow-ups are overdue.');
    expect(screen.queryByText(/more →/)).toBeNull();
  });
});
