import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

/**
 * The dashboard's top panel, and the day it spent going quietly stale.
 *
 * This fetched once on mount and never again — on the one admin page most
 * likely to be left open from nine in the morning until six. By the afternoon
 * the headline, the "waiting on us" band and the call counts were all from
 * whenever the tab was opened, with nothing on screen admitting it. The only
 * refresh control on the page refreshed the *other* half (the breakdown), sat
 * above these lanes where it read as theirs, and disappeared entirely when the
 * breakdown was collapsed — which is the default.
 *
 * So: a minute timer, a refetch when the tab comes back into view, a label
 * saying how old what you are reading is — and the brake from
 * lib/use-admin-poll.ts, because a panel that re-asks forever is how the admin
 * generated thousands of 401s a night the last time.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { Today } from '@/components/admin/dashboard/Today';

/** The smallest shape the panel will render without throwing. */
const body = (over: { callsToday?: number } = {}) => ({
  success: true,
  sell: {
    overdueFollowUps: [],
    repliedCount: 0,
    neverContactedCount: 0,
    openedMockups: [],
    approvedMockups: [],
    unsignedProposals: [],
    callsToday: over.callsToday ?? 0,
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
});

const ok = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => payload }) as unknown as Response;
const status = (code: number) =>
  ({ ok: false, status: code, json: async () => ({}) }) as unknown as Response;

const MINUTE = 60_000;

let fetchMock: ReturnType<typeof vi.fn>;
let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  fetchMock = vi.fn().mockResolvedValue(ok(body()));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Lets the awaits inside one load settle without advancing the clock, and lets
 * React commit what they set. Both halves matter: the fetch resolves in
 * microtasks, and the state it writes lands on the next act boundary.
 */
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

/** The same, having first advanced the clock far enough to trip the timer. */
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const show = (hiddenNow: boolean) => {
  hidden = hiddenNow;
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('the Today panel', () => {
  it('asks again on its own, without anybody touching the page', async () => {
    render(<Today />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await advance(MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('tells the page when it settled, so the page can say how old this is', async () => {
    const settled = vi.fn();
    render(<Today onSettled={settled} />);
    await settle();
    expect(settled).toHaveBeenCalledWith(expect.any(Date));

    // Including the loads nobody asked for — otherwise the label above these
    // lanes ages while the lanes themselves are current.
    settled.mockClear();
    await advance(MINUTE);
    expect(settled).toHaveBeenCalledWith(expect.any(Date));
  });

  it('leaves a tab nobody is looking at alone, and catches up when it comes back', async () => {
    render(<Today />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    show(true);
    await advance(3 * MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    show(false);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches when the page asks it to', async () => {
    const { rerender } = render(<Today refreshSignal={0} />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender(<Today refreshSignal={1} />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good screen when one refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(ok(body({ callsToday: 4 })));
    render(<Today />);
    await settle();
    expect(screen.getByText(/4 calls logged today/i)).toBeTruthy();

    fetchMock.mockResolvedValueOnce(status(500));
    await advance(MINUTE);

    // Still the 9am truth, honestly labelled — not an error banner where a
    // working dashboard used to be.
    expect(screen.getByText(/4 calls logged today/i)).toBeTruthy();
  });

  it('gives up for good once the session is gone', async () => {
    fetchMock.mockResolvedValue(status(401));
    render(<Today />);
    await settle();
    expect(push).toHaveBeenCalledWith('/admin/login');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The brake: no further asking on a tab whose cookie has expired.
    await advance(10 * MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
