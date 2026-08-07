import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TasksWidget } from '@/components/admin/TasksWidget';
import { MockupsCard } from '@/components/admin/MockupAttachments';
import { SignatureCertificatesCard } from '@/components/admin/SignatureCertificates';

/**
 * The rest of the dashboard's self-fetching cards, on the same refresh signal
 * Today already takes.
 *
 * Each of these owns its own fetch and had `[]` deps, so it loaded once when
 * the tab was opened and never again. The refresh control reached Today and
 * the breakdown and stopped there — which is the worse failure of the two,
 * because a page that visibly refreshes some of its cards reads as having
 * refreshed all of them, and the stale ones now look confirmed.
 *
 * A card that fetches on mount and never again is a one-line change away from
 * coming back, so this holds the deps rather than the wiring.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const fetchMock = vi.fn();
let respond: () => Promise<unknown>;

const ok = (body: unknown) => async () =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockImplementation(() => respond());
  vi.stubGlobal('fetch', fetchMock);
});

/**
 * Renders, waits for the first load, then bumps the signal and asserts the
 * card went back to the network. Counted as a delta because the test renderer
 * mounts effects twice — the absolute number is not the thing being checked.
 */
async function refetchesOnSignal(renderAt: (signal: number) => React.ReactElement) {
  const { rerender } = render(renderAt(0));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const afterMount = fetchMock.mock.calls.length;

  rerender(renderAt(0));
  expect(fetchMock.mock.calls.length).toBe(afterMount);

  rerender(renderAt(1));
  await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(afterMount));
}

describe('cards that fetch for themselves', () => {
  it('reloads the task list', async () => {
    respond = ok({ success: true, tasks: [] });
    await refetchesOnSignal((refreshSignal) => <TasksWidget refreshSignal={refreshSignal} />);
  });

  it('reloads the mockups card', async () => {
    respond = ok({ success: true, leads: [] });
    await refetchesOnSignal((refreshSignal) => <MockupsCard refreshSignal={refreshSignal} />);
  });

  it('reloads the signature certificates', async () => {
    respond = ok({ records: [] });
    await refetchesOnSignal((refreshSignal) => (
      <SignatureCertificatesCard refreshSignal={refreshSignal} />
    ));
  });
});

describe('mounted without a signal', () => {
  /**
   * The prop is optional so these stay usable outside the dashboard. Defaulted
   * rather than required, and still loading once, is the behaviour every other
   * caller depends on.
   */
  it('still loads once', async () => {
    respond = ok({ success: true, tasks: [] });
    render(<TasksWidget />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/loading/i)).toBeNull();
  });
});
