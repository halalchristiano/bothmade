import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIAL_HANDOVER_WINDOW_MS, recordDialAttempt, watchForHandover } from '@/lib/dial-intent';

const beacon = vi.fn();
vi.mock('@/lib/beacon', () => ({ beacon: (url: string) => beacon(url) }));

/**
 * Counting a dial only once the phone actually dials.
 *
 * THE BUG. Tapping a `tel:` link does not place a call. iOS puts up its own
 * sheet first — a blue "Call 770-616-2662" and a grey "Cancel" — and nothing
 * has happened until one of those is pressed. Recording the dial from the
 * click handler counted the tap, so every cancel, every mis-tap and every
 * back-out landed in the one number that exists to be trustworthy.
 *
 * A counter that inflates itself is worse than no counter. It cannot be used
 * to hold anybody to anything, including themselves.
 *
 * HOW THE TWO ARE TOLD APART. The sheet is drawn over the page and the page
 * stays visible behind it, so Cancel changes nothing the browser can see.
 * Call opens the phone app, which backgrounds the browser — and that the
 * browser reports. The page going away IS the call starting.
 */

let visibility: DocumentVisibilityState = 'visible';

const hideThePage = () => {
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('when the call goes through', () => {
  it('records it once the phone app takes over', () => {
    const dialled = vi.fn();
    watchForHandover(dialled);

    hideThePage();

    expect(dialled).toHaveBeenCalledTimes(1);
  });

  /** Some browsers fire pagehide with the document still marked visible. */
  it('records it on pagehide even without a visibility change', () => {
    const dialled = vi.fn();
    watchForHandover(dialled);

    window.dispatchEvent(new Event('pagehide'));

    expect(dialled).toHaveBeenCalledTimes(1);
  });

  it('sends the beacon and flips the screen together', () => {
    const onDialled = vi.fn();
    recordDialAttempt('/api/admin/leads/lead_1/dial', onDialled);

    hideThePage();

    expect(beacon).toHaveBeenCalledWith('/api/admin/leads/lead_1/dial');
    expect(onDialled).toHaveBeenCalledTimes(1);
  });
});

describe('when they press Cancel', () => {
  /**
   * The whole point. Nothing about the page changes when the sheet is
   * dismissed, so nothing should be recorded — and the screen must stay
   * exactly as they left it, script and all.
   */
  it('records nothing at all', () => {
    const dialled = vi.fn();
    watchForHandover(dialled);

    vi.advanceTimersByTime(DIAL_HANDOVER_WINDOW_MS + 1000);

    expect(dialled).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  /**
   * Backgrounding the browser for something unrelated half an hour later is
   * not a call. The window is what stops a stale armed tap being redeemed by
   * the next app switch of the day.
   */
  it('has forgotten the tap by the time you switch apps later', () => {
    const dialled = vi.fn();
    watchForHandover(dialled);

    vi.advanceTimersByTime(DIAL_HANDOVER_WINDOW_MS + 1);
    hideThePage();

    expect(dialled).not.toHaveBeenCalled();
  });

  /** Generous enough for a slow device and a moment's hesitation. */
  it('still counts a call confirmed after a pause', () => {
    const dialled = vi.fn();
    watchForHandover(dialled);

    vi.advanceTimersByTime(DIAL_HANDOVER_WINDOW_MS - 1000);
    hideThePage();

    expect(dialled).toHaveBeenCalledTimes(1);
  });
});

describe('never counting one call twice', () => {
  it('fires once however many times the page hides', () => {
    const dialled = vi.fn();
    watchForHandover(dialled);

    hideThePage();
    window.dispatchEvent(new Event('pagehide'));
    hideThePage();

    expect(dialled).toHaveBeenCalledTimes(1);
  });

  /**
   * Tapping a second number before the first resolved. The returned cleanup
   * is what stops two watchers racing to record the same handover as two
   * separate calls.
   */
  it('lets a second tap replace the first', () => {
    const first = vi.fn();
    const second = vi.fn();

    const cancelFirst = watchForHandover(first);
    cancelFirst();
    watchForHandover(second);

    hideThePage();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening once it has settled', () => {
    const dialled = vi.fn();
    const cancel = watchForHandover(dialled);

    hideThePage();
    cancel();
    hideThePage();

    expect(dialled).toHaveBeenCalledTimes(1);
  });
});
