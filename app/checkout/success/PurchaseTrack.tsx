'use client';

import { useEffect } from 'react';
import { track } from '@vercel/analytics';

/**
 * Fires the purchase conversion event once, on the success page. Kept as a
 * tiny client island so the success page itself can stay a server component.
 * `kind` distinguishes a first payment (welcome) from a balance payment.
 */
export function PurchaseTrack({ kind }: { kind: string }) {
  useEffect(() => {
    track('purchase', { kind });
  }, [kind]);
  return null;
}
