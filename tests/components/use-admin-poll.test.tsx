import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * The admin's background polling.
 *
 * Written after a 47% error rate on a site with forty visitors a week turned
 * out to be the admin talking to itself. Two loops refresh the notification
 * bell and the chat badge every twenty or thirty seconds — six requests a
 * minute per open tab — and neither had any idea when to stop.
 *
 * A tab left open overnight kept polling on the same timer after its session
 * expired, and every request came back 401. The results were swallowed, so
 * nothing on screen changed and nothing ever gave up: roughly eight and a
 * half thousand 401s a day, per abandoned tab, for as long as the browser
 * stayed open.
 *
 * These are the two brakes.
 */

import { useAdminPoll } from '@/lib/use-admin-poll';

const EVERY = 20_000;

function Poller({
  onData = () => {},
  onUnauthorized,
  enabled = true,
}: {
  onData?: (d: unknown) => void;
  onUnauthorized?: () => void;
  enabled?: boolean;
}) {
  useAdminPoll('/api/admin/thing', EVERY, onData, { enabled, onUnauthorized });
  return null;
}

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const status = (code: number) =>
  ({ ok: false, status: code, json: async () => ({}) }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  fetchMock = vi.fn().mockResolvedValue(ok({ success: true }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Lets the awaits inside one poll settle without advancing the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('while everything is fine', () => {
  it('reads once immediately, then on every tick', async () => {
    render(<Poller />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(EVERY * 3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('hands the body straight to the caller', async () => {
    const onData = vi.fn();
    fetchMock.mockResolvedValue(ok({ success: true, count: 3 }));

    render(<Poller onData={onData} />);
    await settle();

    expect(onData).toHaveBeenCalledWith({ success: true, count: 3 });
  });

  it('does not start at all when it is switched off', async () => {
    render(<Poller enabled={false} />);
    await vi.advanceTimersByTimeAsync(EVERY * 3);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('when the session has gone', () => {
  /**
   * The bug, exactly. Every later request would be the identical 401, and
   * the screen behind it cannot do anything either — so one is enough.
   */
  it('stops for good after a single 401', async () => {
    fetchMock.mockResolvedValue(status(401));

    render(<Poller />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(EVERY * 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says so, so the tab can go to the login page instead of sitting there', async () => {
    fetchMock.mockResolvedValue(status(401));
    const onUnauthorized = vi.fn();

    render(<Poller onUnauthorized={onUnauthorized} />);
    await settle();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('treats a 403 the same way — it is not going to become a 200', async () => {
    fetchMock.mockResolvedValue(status(403));

    render(<Poller />);
    await settle();
    await vi.advanceTimersByTimeAsync(EVERY * 5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A dropped connection or a 500 is a blip, and the next tick is exactly
   * what it is for. Giving up on those would leave a badge frozen for the
   * rest of the day over one bad second.
   */
  it('keeps going through an error that might not repeat', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network')).mockResolvedValue(ok({ success: true }));

    render(<Poller />);
    await settle();
    await vi.advanceTimersByTimeAsync(EVERY * 2);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });

  it('keeps going through a 500', async () => {
    fetchMock.mockResolvedValue(status(500));

    render(<Poller />);
    await settle();
    await vi.advanceTimersByTimeAsync(EVERY * 2);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });
});

describe('when nobody is looking at the tab', () => {
  it('goes quiet, and catches up the moment it comes back', async () => {
    render(<Poller />);
    await settle();
    fetchMock.mockClear();

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(EVERY * 5);
    expect(fetchMock).not.toHaveBeenCalled();

    // Straight away on return, rather than waiting out the rest of an
    // interval that elapsed while nobody could see it.
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never starts if the tab was already in the background', async () => {
    hidden = true;

    render(<Poller />);
    await vi.advanceTimersByTimeAsync(EVERY * 3);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** Coming back twice must not leave two timers running. */
  it('does not stack timers when it is shown again and again', async () => {
    render(<Poller />);
    await settle();

    for (const state of [true, false, true, false]) {
      hidden = state;
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();
    }
    fetchMock.mockClear();

    await vi.advanceTimersByTimeAsync(EVERY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('when the page goes away', () => {
  it('stops polling once it is unmounted', async () => {
    const { unmount } = render(<Poller />);
    await settle();
    unmount();
    fetchMock.mockClear();

    await vi.advanceTimersByTimeAsync(EVERY * 4);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
