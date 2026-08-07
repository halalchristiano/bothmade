import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Today } from '@/components/admin/dashboard/Today';

/**
 * THE BUG. This card is the one thing on the dashboard that is always on
 * screen — it is the whole point of the page, the answer to "what do I do
 * now". It loaded once on mount and never again.
 *
 * The refresh control sat below it and drove only the collapsible breakdown,
 * so "Updated 2m ago" appeared above a list that could be hours old. A
 * refresh button that visibly skips the card above it is worse than no button
 * at all, because the stale list now looks confirmed.
 */

// One stable object across renders, as the real useRouter returns — a fresh
// one per call would itself retrigger the effect and hide what these assert.
const ROUTER = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => ROUTER }));

const EMPTY = {
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

function mockFetch(responder: () => { ok: boolean; body?: unknown }) {
  const fetchMock = vi.fn(async () => {
    const { ok, body } = responder();
    return { ok, status: ok ? 200 : 500, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshing the card', () => {
  it('refetches when the refresh signal changes', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, body: EMPTY }));
    const { rerender } = render(<Today refreshSignal={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(<Today refreshSignal={1} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('does not refetch when the parent re-renders for other reasons', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, body: EMPTY }));
    const { rerender } = render(<Today refreshSignal={0} onSettled={() => {}} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // A fresh onSettled closure every render — the shape a parent naturally
    // produces, and the reason it must stay out of the effect's deps.
    rerender(<Today refreshSignal={0} onSettled={() => {}} />);
    rerender(<Today refreshSignal={0} onSettled={() => {}} />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports when it loaded, so the header can date what is on screen', async () => {
    mockFetch(() => ({ ok: true, body: EMPTY }));
    const settled = vi.fn();

    render(<Today refreshSignal={0} onSettled={settled} />);

    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(settled.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it('reports a failure as null rather than staying silent', async () => {
    mockFetch(() => ({ ok: false }));
    const settled = vi.fn();

    render(<Today refreshSignal={0} onSettled={settled} />);

    await waitFor(() => expect(settled).toHaveBeenCalledWith(null));
    expect(screen.getByText(/couldn't load today/i)).toBeInTheDocument();
  });

  it('recovers from a failed load when refreshed', async () => {
    let healthy = false;
    mockFetch(() => (healthy ? { ok: true, body: EMPTY } : { ok: false }));
    const { rerender } = render(<Today refreshSignal={0} />);
    await screen.findByText(/couldn't load today/i);

    healthy = true;
    rerender(<Today refreshSignal={1} />);

    await waitFor(() =>
      expect(screen.queryByText(/couldn't load today/i)).not.toBeInTheDocument()
    );
  });
});
