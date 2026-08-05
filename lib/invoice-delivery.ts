/**
 * Did the invoice actually reach anybody?
 *
 * We already know whether an invoice was sent, and whether its payment link
 * was clicked. The gap between those two facts is the expensive one: an
 * invoice that was sent and never clicked looks identical whether it landed
 * in a spam folder, went to a person who left the company, or is sitting read
 * and ignored on somebody's desk. The first two are our problem and are fixed
 * in a minute by asking for the right address. The third is theirs, and is
 * fixed by a phone call. Chasing the wrong one wastes weeks.
 *
 * An open pixel closes it, with an important caveat about what an "open"
 * actually is now.
 *
 * WHAT AN OPEN IS WORTH. Apple Mail Privacy Protection fetches every image in
 * every message on delivery, whether or not the human ever looks at it, and
 * Gmail proxies images through its own cache. So a recorded open is NOT proof
 * a person read anything. What it does prove is that the message got past the
 * spam filter and into a real mailbox that a real mail client is syncing —
 * which is precisely the question we could not answer before.
 *
 * The absence is the stronger signal, and it runs the other way: between
 * privacy proxies that load everything and ordinary clients that load images
 * by default, most delivered invoices register something. One that registers
 * nothing at all, days later, most likely never arrived.
 *
 * So this module deliberately never says "they read it". It says the message
 * reached a mailbox, or that nothing came back at all, and it names the next
 * action for each. Everything below is derived — nothing here is stored as a
 * conclusion, so the reading can be corrected later without a migration.
 */

export type DeliveryState =
  | 'not-sent'
  | 'no-signal'
  | 'delivered'
  | 'clicked'
  | 'paid';

export interface DeliveryFacts {
  status: string;
  emailSentAt: Date | string | null;
  emailOpenedAt: Date | string | null;
  emailOpens: number;
  linkClickedAt: Date | string | null;
  linkClicks: number;
}

export interface DeliveryReading {
  state: DeliveryState;
  /** What we can honestly claim, in one line, for the row in the UI. */
  headline: string;
  /** What to do about it, or null when there is nothing to do. */
  nextStep: string | null;
  /** Worth drawing attention to — an invoice that may never have landed. */
  concerning: boolean;
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * How long after sending an open stops looking like a machine.
 *
 * A scanner or a privacy proxy fetches the pixel within seconds of delivery.
 * A human opening their email that fast is possible and rare. We do not use
 * this to discard the open — it still proves delivery, which is the point —
 * only to keep the wording honest about who did the opening.
 */
export const MACHINE_OPEN_WINDOW_MS = 60_000;

/**
 * How long a sent invoice may show nothing before that silence is worth
 * acting on. Under a day it is simply too early: plenty of people do not
 * open their email until the next morning.
 */
export const SILENCE_CONCERNING_AFTER_MS = 24 * 60 * 60 * 1000;

function dayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function readDelivery(facts: DeliveryFacts, now: Date = new Date()): DeliveryReading {
  if (facts.status === 'paid') {
    return { state: 'paid', headline: 'Paid', nextStep: null, concerning: false };
  }

  const sentAt = toDate(facts.emailSentAt);
  if (!sentAt) {
    return {
      state: 'not-sent',
      headline: 'Not emailed yet',
      nextStep: 'Send it when the stage allows.',
      concerning: false,
    };
  }

  const clickedAt = toDate(facts.linkClickedAt);
  if (clickedAt) {
    const times = facts.linkClicks > 1 ? ` ${facts.linkClicks} times, last` : '';
    return {
      state: 'clicked',
      headline: `Opened the payment page${times} ${dayLabel(clickedAt)} — didn't finish`,
      nextStep: 'A card that failed or a decision being made. Worth a call rather than another email.',
      concerning: false,
    };
  }

  const openedAt = toDate(facts.emailOpenedAt);
  if (openedAt) {
    // Deliberately not "they read it" — see the note at the top of the file.
    const machine = openedAt.getTime() - sentAt.getTime() < MACHINE_OPEN_WINDOW_MS;
    return {
      state: 'delivered',
      headline: machine
        ? `Reached their mailbox ${dayLabel(openedAt)} — no click yet`
        : `Email opened ${dayLabel(openedAt)} — no click yet`,
      nextStep: 'It landed. Nothing wrong with the address, so the chase emails are doing their job.',
      concerning: false,
    };
  }

  const silentFor = now.getTime() - sentAt.getTime();
  const tooEarly = silentFor < SILENCE_CONCERNING_AFTER_MS;
  return {
    state: 'no-signal',
    headline: tooEarly
      ? `Sent ${dayLabel(sentAt)} — nothing back yet`
      : `Sent ${dayLabel(sentAt)} — never opened, never clicked`,
    nextStep: tooEarly
      ? null
      : 'Most likely it never landed — spam folder, or the wrong person. Check the address before chasing again.',
    concerning: !tooEarly,
  };
}

/**
 * The pixel's address.
 *
 * Kept short because it goes in an email: some clients and some corporate
 * gateways rewrite or truncate long URLs, and every character here is one
 * more chance of that.
 */
export function openPixelUrl(siteUrl: string, instalmentId: string): string {
  return `${siteUrl.replace(/\/$/, '')}/e/${encodeURIComponent(instalmentId)}`;
}
