import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * The purchase conversion, and the reload that counted it again.
 *
 * `PurchaseTrack` fired on mount with no memory of having fired, and its own
 * comment said "once". The receipt page is one people reload — they refresh
 * to see whether anything changed, they hit back from the dashboard, they
 * reopen the tab hours later — and every one of those was another purchase.
 *
 * This is the event the ad platforms import as a conversion, so the number it
 * inflates is the number acquisition decisions are made from, and it inflates
 * it most for the clients who look at their receipt the most. Neither this
 * component nor lib/analytics had any tests.
 */

const vercelTrack = vi.fn();
const gaTrack = vi.fn();
vi.mock('@vercel/analytics', () => ({ track: (...a: unknown[]) => vercelTrack(...a) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: (...a: unknown[]) => gaTrack(...a) }));

const { PurchaseTrack } = await import('@/app/checkout/success/PurchaseTrack');

beforeEach(() => {
  vercelTrack.mockReset();
  gaTrack.mockReset();
  window.sessionStorage.clear();
});

describe('a payment that happened once', () => {
  it('is reported once, to both destinations', () => {
    render(<PurchaseTrack kind="welcome" sessionId="cs_test_1" />);

    expect(vercelTrack).toHaveBeenCalledWith('purchase', { kind: 'welcome' });
    expect(gaTrack).toHaveBeenCalledWith('purchase', { kind: 'welcome' });
    expect(vercelTrack).toHaveBeenCalledTimes(1);
  });

  it('is not reported again when the page is reloaded', () => {
    // A remount is what a refresh, a back-navigation, or reopening the tab
    // looks like from here. The old version counted every one of them.
    render(<PurchaseTrack kind="welcome" sessionId="cs_test_1" />);
    render(<PurchaseTrack kind="welcome" sessionId="cs_test_1" />);
    render(<PurchaseTrack kind="welcome" sessionId="cs_test_1" />);

    expect(vercelTrack).toHaveBeenCalledTimes(1);
    expect(gaTrack).toHaveBeenCalledTimes(1);
  });

  it('is not reported again without a session id either', () => {
    // Two of the three redirect targets carry no session_id, so the kind has
    // to be enough to stop a plain refresh re-reporting.
    render(<PurchaseTrack kind="care" />);
    render(<PurchaseTrack kind="care" />);

    expect(vercelTrack).toHaveBeenCalledTimes(1);
  });
});

describe('two payments that really are two', () => {
  it('reports each Stripe session separately', () => {
    render(<PurchaseTrack kind="balance" sessionId="cs_test_1" />);
    render(<PurchaseTrack kind="balance" sessionId="cs_test_2" />);

    expect(vercelTrack).toHaveBeenCalledTimes(2);
  });

  it('reports a different kind of payment separately when there is no session id', () => {
    render(<PurchaseTrack kind="welcome" />);
    render(<PurchaseTrack kind="care" />);

    expect(vercelTrack.mock.calls.map(([, p]) => (p as { kind: string }).kind)).toEqual([
      'welcome',
      'care',
    ]);
  });
});

describe('when there is nowhere to remember', () => {
  it('stays silent rather than counting a purchase it cannot bound', () => {
    // Safari private browsing and blocked third-party contexts both throw
    // here. Losing a conversion is a smaller error than inventing one, and
    // this is the one place that trade is obvious.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    render(<PurchaseTrack kind="welcome" sessionId="cs_test_1" />);

    expect(vercelTrack).not.toHaveBeenCalled();
    getItem.mockRestore();
  });
});
