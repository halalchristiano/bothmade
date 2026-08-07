import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboardPage from '@/app/admin/dashboard/page';

/**
 * "Do This Next" is the longest list on the dashboard and was the only one
 * with no cap on it.
 *
 * It merges six uncapped sources off sales-stats — overdue, due today, hot,
 * stale, stalled late-funnel, unsigned contracts — none of which the endpoint
 * limits, because they are JS filters over the whole book. So a rep with a few
 * hundred leads rendered a few hundred rows, each carrying a call link, a mail
 * link, a log-touch popover and a snooze button, and everything below the card
 * went off the bottom of the page.
 *
 * It shows eight, names how many it is holding back, and opens the rest into
 * its own bounded scroll rather than down the page — the cap is worth nothing
 * if expanding undoes it. The badge counts all of them throughout: a capped
 * list with an honest number beside it is the pairing worth holding.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ACTIONS_SHOWN = 8;
const OVERDUE = 25;

const overdueLeads = Array.from({ length: OVERDUE }, (_, i) => ({
  id: `lead_${i}`,
  company: `Company ${i}`,
  nextFollowUpAt: '2026-08-01T00:00:00.000Z',
  phone: null,
  email: null,
}));

const salesStats = {
  periodLabel: 'This Week',
  pipeline: [],
  weightedForecast: 0,
  totalPipelineValue: 0,
  thisWeek: { newLeads: 0, activityLogged: 0, won: 0, revenue: 0 },
  conversionRate: 0,
  avgDealSize: 0,
  lostReasonCounts: {},
  hotLeads: [],
  followUpsToday: [],
  followUpsOverdue: overdueLeads,
  staleLeads: [],
  stageAging: [],
  awaitingSignature: [],
  sourcePerformance: [],
  clientTypeBreakdown: {},
  wonDeals: [],
  totalWonValue: 0,
};

const opsStats = {
  periodLabel: 'This Week',
  newHandoffs: [],
  newClientsThisWeek: 0,
  atRiskProjects: [],
  waitingOnClient: [],
  overdueBalances: [],
  projectsAwaitingReply: [],
  awaitingSignatureCount: 0,
  pendingMockups: [],
  revenueThisMonth: 0,
  revenueLastMonth: 0,
  revenueHistory: [],
  activeProjectCount: 0,
  activityFeed: [],
};

/**
 * Routes by URL so the page's other cards — Today, tasks, mockups, the team —
 * each get something valid rather than the same blob. Anything unrecognised
 * gets a bare success, which is enough for a card that only renders a list.
 */
const respondTo = (url: string): unknown => {
  if (url.startsWith('/api/auth/me')) return { user: { name: 'Kiana' } };
  if (url.startsWith('/api/admin/sales-stats')) return { success: true, stats: salesStats };
  if (url.startsWith('/api/admin/ops-stats')) return { success: true, stats: opsStats };
  if (url.startsWith('/api/admin/users')) return { users: [] };
  if (url.startsWith('/api/admin/today')) {
    return {
      success: true,
      sell: {
        overdueFollowUps: [],
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
        uninvoiced: [],
        uninvoicedTotalCents: 0,
        unpaidInvoices: [],
        collectedThisMonthCents: 0,
      },
      deliver: {
        activeProjects: 0,
        stalledProjects: [],
        mockupRequests: 0,
        designsOwed: [],
        mockupsBuiltNotSent: [],
        unreadDesignFeedback: [],
      },
    };
  }
  return { success: true, tasks: [], leads: [], records: [] };
};

beforeEach(() => {
  vi.clearAllMocks();
  // The breakdown is collapsed by default and does not fetch until opened.
  localStorage.setItem('bothmade_dashboard_breakdown', 'open');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => respondTo(String(input)),
    })) as unknown as typeof fetch
  );
});

/** The card, once the breakdown has loaded it. */
const card = async () => {
  const heading = await screen.findByText('Do This Next');
  // Walk up to the Card that owns the heading, so the assertions can't stray
  // into the lists in the operations half below.
  const el = heading.closest('div[class*="rounded"]')?.parentElement as HTMLElement;
  return el ?? (heading.parentElement as HTMLElement);
};

describe('Do This Next, on a full book', () => {
  it('caps the rows and counts all of them', async () => {
    render(<AdminDashboardPage />);
    const scope = await card();

    await waitFor(() => expect(within(scope).getByText('Company 0')).toBeInTheDocument());

    expect(within(scope).getByText(`Company ${ACTIONS_SHOWN - 1}`)).toBeInTheDocument();
    expect(within(scope).queryByText(`Company ${ACTIONS_SHOWN}`)).not.toBeInTheDocument();
    expect(within(scope).queryByText(`Company ${OVERDUE - 1}`)).not.toBeInTheDocument();

    // The badge is the honest number, not the number rendered.
    expect(within(scope).getByText(String(OVERDUE))).toBeInTheDocument();
  });

  it('names the number it is holding back', async () => {
    render(<AdminDashboardPage />);
    const scope = await card();
    await waitFor(() => expect(within(scope).getByText('Company 0')).toBeInTheDocument());

    const toggle = within(scope).getByRole('button', {
      name: new RegExp(`show ${OVERDUE - ACTIONS_SHOWN} more`, 'i'),
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the lot, inside its own scroll rather than down the page', async () => {
    render(<AdminDashboardPage />);
    const scope = await card();
    await waitFor(() => expect(within(scope).getByText('Company 0')).toBeInTheDocument());

    await userEvent.click(within(scope).getByRole('button', { name: /show \d+ more/i }));

    expect(within(scope).getByText(`Company ${OVERDUE - 1}`)).toBeInTheDocument();
    // Bounded height is the point: expanding must not push the operations
    // half off the bottom of the page, which is the thing the cap exists for.
    expect(within(scope).getByText('Company 0').closest('div[class*="overflow-y-auto"]')).not.toBeNull();

    const collapse = within(scope).getByRole('button', { name: /show fewer/i });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(collapse);
    expect(within(scope).queryByText(`Company ${OVERDUE - 1}`)).not.toBeInTheDocument();
  });
});
