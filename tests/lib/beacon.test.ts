import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beacon } from '@/lib/beacon';

/**
 * Telling the server something on the way out of the page.
 *
 * Tapping a `tel:` link hands the screen to the phone app, and the browser may
 * freeze or discard the page a moment later. An ordinary `fetch` is cancelled
 * when that happens — so the request that records the dial dies exactly when
 * it matters, on the one measurement in this system nobody has to remember to
 * take.
 *
 * `sendBeacon` is the API built for that case: the browser takes ownership of
 * the request and delivers it whatever happens to the page. What is pinned
 * here is that it is preferred, that there is a fallback when it isn't there,
 * and that nothing about this can ever throw at somebody who is mid-call.
 */

const sendBeacon = vi.fn(() => true);
const fetchMock = vi.fn(async () => ({ ok: true }) as Response);

beforeEach(() => {
  vi.clearAllMocks();
  sendBeacon.mockReturnValue(true);
  vi.stubGlobal('navigator', { sendBeacon });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('on a browser that has it', () => {
  it('hands the request to the browser to deliver', () => {
    beacon('/api/admin/leads/lead_1/dial');

    expect(sendBeacon).toHaveBeenCalledWith('/api/admin/leads/lead_1/dial');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('when it is not available or refuses', () => {
  it('falls back to a request the browser keeps alive', () => {
    vi.stubGlobal('navigator', {});

    beacon('/api/admin/leads/lead_1/dial');

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/leads/lead_1/dial', {
      method: 'POST',
      keepalive: true,
    });
  });

  /** sendBeacon answers false when its queue is full rather than throwing. */
  it('falls back when the browser declines to take it', () => {
    sendBeacon.mockReturnValue(false);

    beacon('/api/admin/leads/lead_1/dial');

    expect(fetchMock).toHaveBeenCalled();
  });

  it('falls back when it throws instead of answering', () => {
    sendBeacon.mockImplementation(() => {
      throw new Error('blocked');
    });

    beacon('/api/admin/leads/lead_1/dial');

    expect(fetchMock).toHaveBeenCalled();
  });
});

/**
 * There is nobody left on the page to show an error to, and a failed
 * measurement must never look like a failed call.
 */
describe('when everything fails', () => {
  it('never throws at somebody who is about to make a call', () => {
    vi.stubGlobal('navigator', {});
    fetchMock.mockImplementation(() => {
      throw new Error('offline');
    });

    expect(() => beacon('/api/admin/leads/lead_1/dial')).not.toThrow();
  });

  it('never rejects into an unhandled promise', () => {
    vi.stubGlobal('navigator', {});
    fetchMock.mockRejectedValue(new Error('offline'));

    expect(() => beacon('/api/admin/leads/lead_1/dial')).not.toThrow();
  });
});
