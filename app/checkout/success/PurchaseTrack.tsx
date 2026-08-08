'use client';

import { useEffect } from 'react';
import { track } from '@vercel/analytics';
import { trackEvent } from '@/lib/analytics';

/**
 * Fires the purchase conversion event once, on the success page. Kept as a
 * tiny client island so the success page itself can stay a server component.
 * `kind` distinguishes a first payment (welcome) from a balance payment.
 *
 * "Once" is the part that was not true. This ran on mount with no memory, so
 * every reload of the receipt page counted another purchase — and this is a
 * page people reload: they refresh to see if anything changed, they hit back
 * from the dashboard, they reopen the tab hours later. The event is the one
 * the ad platforms import as a conversion, so the number it inflates is the
 * number every acquisition decision is made from, and it inflates it most for
 * the clients who look at their receipt the most.
 *
 * The guard is `sessionStorage` rather than a ref: a ref is per-mount, which
 * is exactly the thing that was not enough. Keyed on the Stripe session id
 * where one is in the URL — the same payment is the same conversion, whatever
 * happens to the tab — and on the kind otherwise, which still stops a refresh
 * re-reporting.
 *
 * Failing to record that we fired must never mean firing twice, so a storage
 * that throws (Safari private browsing, a blocked third-party context) is
 * treated as "already sent". Losing a conversion is a smaller error than
 * inventing one, and this is the one place that trade is obvious.
 */
export function PurchaseTrack({ kind, sessionId }: { kind: string; sessionId?: string }) {
  useEffect(() => {
    const key = `bothmade_purchase_tracked_${sessionId || kind}`;

    let alreadySent = true;
    try {
      alreadySent = window.sessionStorage.getItem(key) !== null;
      if (!alreadySent) window.sessionStorage.setItem(key, '1');
    } catch {
      // No storage to remember with. See above: silence beats a double count.
    }
    if (alreadySent) return;

    track('purchase', { kind });
    trackEvent('purchase', { kind });
  }, [kind, sessionId]);
  return null;
}
