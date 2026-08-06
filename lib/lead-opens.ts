/**
 * Who opened the cold email, and how many times.
 *
 * The leads list could say an email was sent and, if Gmail was connected,
 * that somebody wrote back. Between those two facts sat the entire middle of
 * the pipeline: four hundred businesses that were emailed, said nothing, and
 * were therefore indistinguishable from each other. One of them read it six
 * times and forwarded it to their boss. One of them never received it. They
 * got called in whatever order the list happened to be sorted in.
 *
 * A one-pixel image on the cold email closes that gap, and this module is the
 * part that decides what the pixel is allowed to mean.
 *
 * WHAT AN OPEN IS WORTH. Apple Mail Privacy Protection fetches every image in
 * every message on delivery whether or not a human ever looks at it, and
 * Gmail proxies images through its own cache. A single open is therefore NOT
 * proof anybody read anything — it proves the message cleared the spam filter
 * and reached a live mailbox, which is already more than we knew before.
 *
 * Repetition is where the signal is. A privacy proxy fetches once, on
 * delivery. A person who comes back to an email three days later, and again
 * the morning after that, is doing something a machine does not do. So the
 * bands below lean on *how many times* and *how far apart*, never on the bare
 * fact of one open.
 *
 * Nothing here is stored as a conclusion. The database holds counts and
 * timestamps; every judgement is derived at read time, so the reading can be
 * sharpened later without a migration and without rewriting history.
 */

/** Where a lead sits, once the email has gone. */
export type OpenBand =
  /** Nothing came back at all. Most likely never landed. */
  | 'silent'
  /** It reached a mailbox. Says nothing about a human. */
  | 'delivered'
  /** Opened more than once, across time. Somebody is looking. */
  | 'engaged'
  /** Opened repeatedly. Call today. */
  | 'hot';

export interface OpenFacts {
  coldEmailSentAt: Date | string | null;
  coldEmailOpens: number;
  /** First fetch of the pixel. */
  coldEmailOpenedAt: Date | string | null;
  /** Most recent fetch. */
  coldEmailLastOpenedAt: Date | string | null;
}

export interface OpenReading {
  band: OpenBand;
  /**
   * Whether a person can be said to have opened this — and therefore whether
   * the lead belongs on the call sheet at all.
   *
   * This is the line the whole call list now hangs off, so it is drawn
   * conservatively: a mail server fetching the image on delivery is not a
   * person, and neither is nothing at all. Anything beyond that prefetch —
   * a second fetch, or a first one that arrives too late to be automatic —
   * is somebody looking.
   */
  callable: boolean;
  /** Opens, as recorded. Shown as-is — never rounded or "corrected". */
  opens: number;
  /** What can honestly be said, in one line, on a row in the queue. */
  headline: string;
  /** What to do about it, or null when there is nothing to do yet. */
  nextStep: string | null;
  /**
   * Ranking weight for the call queue. Higher is called sooner. Derived here
   * rather than in the query so the ordering and the wording can never
   * disagree with each other.
   */
  score: number;
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * How soon after sending an open still looks like a machine.
 *
 * A privacy proxy or a scanner fetches within seconds of delivery. A human
 * opening that fast is possible and rare. The open still counts as proof of
 * delivery — it just isn't evidence of a reader.
 */
export const MACHINE_OPEN_WINDOW_MS = 90_000;

/**
 * How far apart two opens have to be before the second one means anything.
 *
 * Mail clients re-fetch images on scroll, on window focus, and when a
 * conversation is reopened seconds later. Counting those would turn one
 * glance into "opened five times" and put the wrong lead at the top of the
 * queue — which is worse than no signal at all, because it would be believed.
 */
export const DISTINCT_OPEN_GAP_MS = 20 * 60 * 1000;

/** Opens beyond this stop changing the ranking — a loop is not a lead. */
const SCORE_CEILING = 12;

/**
 * How long a sent email may show nothing before the silence is worth acting
 * on. Under a day is simply too early: plenty of people do not open anything
 * until the next morning.
 */
export const SILENCE_CONCERNING_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Read the counts.
 *
 * `now` is injectable because every band here is relative to it, and a test
 * that has to wait a day to assert something gets deleted by the next person
 * who sees it fail.
 */
export function readOpens(facts: OpenFacts, now: Date = new Date()): OpenReading {
  const sentAt = toDate(facts.coldEmailSentAt);
  const firstAt = toDate(facts.coldEmailOpenedAt);
  const lastAt = toDate(facts.coldEmailLastOpenedAt);
  const opens = Math.max(0, facts.coldEmailOpens ?? 0);

  if (!sentAt) {
    return {
      band: 'silent',
      callable: false,
      opens: 0,
      headline: 'No cold email sent yet',
      nextStep: null,
      score: 0,
    };
  }

  if (opens === 0) {
    const waited = now.getTime() - sentAt.getTime();
    const concerning = waited > SILENCE_CONCERNING_AFTER_MS;
    return {
      band: 'silent',
      callable: false,
      opens: 0,
      headline: concerning ? 'Sent, and nothing came back at all' : 'Sent — nothing back yet',
      nextStep: concerning
        ? 'Most delivered email registers something. This probably never landed — call it, and check the address.'
        : null,
      score: 0,
    };
  }

  // The first open is discounted when it arrives at machine speed: it proves
  // delivery and nothing else, so a lead whose only open is a proxy fetch
  // must not outrank a lead a person actually opened twice.
  const firstLooksAutomatic =
    !!firstAt && firstAt.getTime() - sentAt.getTime() < MACHINE_OPEN_WINDOW_MS;
  const humanOpens = firstLooksAutomatic ? opens - 1 : opens;

  // Did anyone come back to it? A privacy proxy fetches once on delivery and
  // never again, so a gap between the first and last open is the single most
  // useful thing this module knows.
  const returned =
    !!firstAt && !!lastAt && lastAt.getTime() - firstAt.getTime() > DISTINCT_OPEN_GAP_MS;

  if (humanOpens >= 4 || (humanOpens >= 2 && returned)) {
    return {
      band: 'hot',
      callable: true,
      opens,
      headline: `Opened ${opens} times${returned ? ', and came back to it' : ''}`,
      nextStep: 'Call today. Somebody is reading this repeatedly and has not written back.',
      score: Math.min(opens, SCORE_CEILING) + (returned ? 2 : 0) + 10,
    };
  }

  if (humanOpens >= 2 || returned) {
    return {
      band: 'engaged',
      callable: true,
      opens,
      headline: `Opened ${opens} times`,
      nextStep: 'Worth a call — it landed and it was read more than once.',
      score: Math.min(opens, SCORE_CEILING) + 5,
    };
  }

  return {
    band: 'delivered',
    // One open counts as a person only when it did not arrive at machine
    // speed. A prefetch on delivery proves the address works and nothing
    // more, and calling on it is exactly the wasted dial the call sheet is
    // now filtered to avoid.
    callable: !firstLooksAutomatic,
    opens,
    headline: firstLooksAutomatic ? 'Delivered — opened on arrival' : 'Opened once',
    nextStep: firstLooksAutomatic
      ? 'It reached a real mailbox. That is all this proves — the open was fast enough to be their mail app, not them.'
      : null,
    score: 1,
  };
}

/**
 * The pixel's address.
 *
 * Deliberately short — some corporate gateways rewrite or truncate long URLs,
 * and every character is another chance of that. `/o/` for opens, matching
 * `/e/` for the invoice one it is modelled on.
 */
export function leadOpenPixelUrl(siteUrl: string, leadId: string): string {
  return `${siteUrl.replace(/\/$/, '')}/o/${encodeURIComponent(leadId)}`;
}

/** Bands worth interrupting a rep's day for, most urgent first. */
export const CALLABLE_OPEN_BANDS: OpenBand[] = ['hot', 'engaged'];
