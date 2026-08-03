/**
 * Conversion tracking for the public site.
 *
 * Two destinations, on purpose. Vercel Analytics is already wired up in
 * app/layout.tsx and needs no configuration, so it is what actually records
 * events today. Google Analytics 4 is what the ad platforms want to import
 * conversions from, and it stays completely dormant until someone sets
 * NEXT_PUBLIC_GA_MEASUREMENT_ID — no script is loaded, no cookie is set, and
 * `trackEvent` returns immediately.
 *
 * Nothing here throws. A missed analytics event must never break the flow it
 * is measuring — least of all the contact form or the checkout return.
 */

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Fires a GA4 event. No-ops when analytics isn't configured, when gtag hasn't
 * finished loading, or on the server.
 */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.gtag) return;
  try {
    window.gtag('event', name, params);
  } catch {
    // A blocked or half-initialised gtag is not this caller's problem.
  }
}
