import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RevenueChartCard } from '@/components/admin/dashboard/RevenueChart';

/**
 * Clicking a second bar before the first one answers.
 *
 * THE BUG. Each bar fires its own request, and the panel below is headed with
 * whichever bar is selected — but nothing tied a response back to the click
 * that asked for it. Click March, click April, and if March came back second
 * you read March's payments under "Apr payments".
 *
 * What makes it worth a test rather than a shrug is that nothing looks wrong.
 * Every row is a real payment; they are simply the wrong month's, and the only
 * way to catch it is to add them up and notice they miss the bar above. A
 * money panel that is confidently, invisibly wrong is worse than one that
 * fails to load.
 */

const MONTHS = [
  { label: 'Mar', value: 500_00, year: 2026, month: 2 },
  { label: 'Apr', value: 900_00, year: 2026, month: 3 },
];

const payment = (company: string) => ({
  id: `pay_${company}`,
  amount: 100_00,
  type: 'deposit',
  createdAt: '2026-04-02T00:00:00.000Z',
  projectId: 'proj_1',
  projectName: 'Site',
  company,
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

/**
 * Hands back a promise per month that the test resolves by hand, so the two
 * requests can be landed in whichever order the race needs.
 */
function deferredByMonth() {
  const resolvers = new Map<number, (payments: unknown[]) => void>();
  fetchMock.mockImplementation((url: string) => {
    const month = Number(new URL(url, 'http://t').searchParams.get('month'));
    return new Promise((resolve) => {
      resolvers.set(month, (payments) =>
        resolve({ ok: true, status: 200, json: async () => ({ success: true, payments }) } as Response)
      );
    });
  });
  return {
    land: async (month: number, payments: unknown[]) => {
      await waitFor(() => expect(resolvers.has(month)).toBe(true));
      resolvers.get(month)!(payments);
    },
  };
}

const bar = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}:`) });

describe('two bars clicked in a row', () => {
  it('shows the month you asked for last, whichever request lands first', async () => {
    const user = userEvent.setup();
    const net = deferredByMonth();

    render(<RevenueChartCard revenueHistory={MONTHS} />);

    await user.click(bar('Mar'));
    await user.click(bar('Apr'));

    // April answers first, then March — the losing request coming home last.
    await net.land(3, [payment('April Co')]);
    await screen.findByText('April Co');

    await net.land(2, [payment('March Co')]);

    // Still April's, under April's heading.
    await screen.findByText('Apr payments');
    expect(screen.getByText('April Co')).toBeTruthy();
    expect(screen.queryByText('March Co')).toBeNull();
  });

  it('keeps the spinner up until the month on screen has answered', async () => {
    const user = userEvent.setup();
    const net = deferredByMonth();

    render(<RevenueChartCard revenueHistory={MONTHS} />);

    await user.click(bar('Mar'));
    await user.click(bar('Apr'));

    // The abandoned request answering must not clear a spinner that belongs
    // to April — the panel would sit empty, reading as a month with no
    // payments in it.
    await net.land(2, [payment('March Co')]);
    // Flushed deliberately: without this the assertion below passes whether
    // or not the response has been processed, which is a test that agrees
    // with anything.
    await act(async () => {});
    expect(screen.getByText('Loading...')).toBeTruthy();

    await net.land(3, [payment('April Co')]);
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  });

  it('does not surface an abandoned request failing', async () => {
    const user = userEvent.setup();
    const resolvers = new Map<number, (r: unknown) => void>();
    fetchMock.mockImplementation((url: string) => {
      const month = Number(new URL(url, 'http://t').searchParams.get('month'));
      return new Promise((resolve, reject) => {
        resolvers.set(month, (r) => (r === 'fail' ? reject(new Error('boom')) : resolve(r)));
      });
    });

    render(<RevenueChartCard revenueHistory={MONTHS} />);
    await user.click(bar('Mar'));
    await user.click(bar('Apr'));

    await waitFor(() => expect(resolvers.has(2)).toBe(true));
    resolvers.get(2)!('fail');

    await waitFor(() => expect(resolvers.has(3)).toBe(true));
    resolvers.get(3)!({
      ok: true,
      status: 200,
      json: async () => ({ success: true, payments: [payment('April Co')] }),
    });

    await screen.findByText('April Co');
    expect(screen.queryByText('boom')).toBeNull();
  });
});

describe('closing the panel and opening another', () => {
  /**
   * The toggle-off on its own hides nothing visible — a late response writes
   * into a panel that is not rendered. It matters on the way back: dismiss
   * March, open April, and March's abandoned request is still out there with
   * a panel to land in.
   */
  it('does not let the dismissed month fill the one opened after it', async () => {
    const user = userEvent.setup();
    const net = deferredByMonth();

    render(<RevenueChartCard revenueHistory={MONTHS} />);

    await user.click(bar('Mar'));
    await screen.findByText('Mar payments');
    await user.click(bar('Mar')); // dismissed, request still in flight
    expect(screen.queryByText('Mar payments')).toBeNull();

    await user.click(bar('Apr'));
    await net.land(2, [payment('March Co')]);
    await act(async () => {});

    // April's panel, still waiting on April.
    expect(screen.getByText('Apr payments')).toBeTruthy();
    expect(screen.queryByText('March Co')).toBeNull();
    expect(screen.getByText('Loading...')).toBeTruthy();

    await net.land(3, [payment('April Co')]);
    await screen.findByText('April Co');
  });
});
