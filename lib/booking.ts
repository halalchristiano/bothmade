/**
 * The one place the "book a call" link lives.
 *
 * Everything that offers a call — the contact-form success state, the
 * acknowledgement email, the checkout-success page — reads it from here, so
 * moving from Cal.com to Calendly (or changing the event type) is a single
 * environment variable rather than a search-and-replace across the site.
 *
 * NEXT_PUBLIC_ so the client bundle can inline it; the value is a public
 * booking page either way, so there's nothing here worth hiding.
 */
export const BOOKING_URL =
  process.env.NEXT_PUBLIC_BOOKING_URL || 'https://cal.com/bothmade/15min';

/** House wording for the booking link — same phrase everywhere it appears. */
export const BOOKING_LABEL = 'Book a 15-minute call';
