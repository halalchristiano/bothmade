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
   * Whether this lead belongs on the call sheet at all — which is any open,
   * full stop.
   *
   * This was drawn much tighter, on the argument that a mail server's fetch
   * on delivery is not a person and a dial into it is wasted. That argument
   * weighs the wrong two things against each other. The cost of ringing a
   * business whose scanner opened the email is one call to a business you
   * were going to call anyway — it is in your book and you emailed it. The
   * cost of hiding a real reader is the best moment you will ever get to ring
   * them, gone. Those are not close, and the tight rule was on the wrong side
   * of them.
   *
   * So one open puts a lead on the sheet, and how good the evidence is
   * decides where it sits inside the opened band rather than whether it is
   * there at all. `score` carries that, and the headline says out loud which
   * kind of open it was, so nobody is misled about what they are ringing.
   */
  callable: boolean;
  /**
   * Whether repetition has actually proved a human — the `engaged` and `hot`
   * bands, and nothing else.
   *
   * Deliberately stricter than `callable`. `callable` decides whether a lead
   * is worth a dial, where a single late open is cheap to act on and cheap to
   * be wrong about. This decides whether we are allowed to say the words "is
   * reading it" and interrupt somebody's evening to say them, which a single
   * open never earns — see the note at the top of this file. Getting that bar
   * wrong sends three phone alerts in ten minutes for three mail scanners and
   * teaches everybody to swipe the next one away.
   */
  confirmedReader: boolean;
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
 * A privacy proxy or a scanner fetches on delivery — and delivery is the part
 * that lags. Ninety seconds was measured from the wrong end: it assumed the
 * scanner fetches the instant we press send, when queueing, greylisting and a
 * slow first hop routinely put five or ten minutes between the send and the
 * mailbox. Every one of those fetches then read as a person, on a single
 * open, at two minutes past midnight.
 *
 * Ten minutes is the honest edge of "this was the delivery, not a reader". A
 * human opening a cold email inside ten minutes of it being sent does happen;
 * it is rare enough that treating it as a machine costs a call sheet position
 * and nothing else, while the other error costs the credibility of every
 * alert we send.
 */
export const MACHINE_OPEN_WINDOW_MS = 10 * 60 * 1000;

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
      confirmedReader: false,
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
      confirmedReader: false,
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

  // Did anyone come back to it? A privacy proxy fetches once on delivery and
  // never again, so a gap between the first and last open is the single most
  // useful thing this module knows.
  const returned =
    !!firstAt && !!lastAt && lastAt.getTime() - firstAt.getTime() > DISTINCT_OPEN_GAP_MS;

  /*
   * How many of these fetches can be attributed to a person.
   *
   * The first is discounted when it arrived at machine speed. But a burst
   * that STARTS automatic and finishes seconds later is all one delivery: a
   * scanner and a mail client rendering the same message produce three or
   * four fetches inside a few seconds, and counting the extras as human
   * turned a proxy into an "engaged" lead with a phone alert attached. With
   * only a first and a last timestamp, no gap means no second visit — so the
   * whole burst is the delivery and none of it is a reader.
   *
   * Where the first open was NOT machine-speed, repeat fetches are left
   * alone: somebody who opens at nine and again a minute later is a person
   * scrolling, which is exactly what it looks like.
   */
  const humanOpens = firstLooksAutomatic ? (returned ? opens - 1 : 0) : opens;

  if (humanOpens >= 4 || (humanOpens >= 2 && returned)) {
    return {
      band: 'hot',
      callable: true,
      confirmedReader: true,
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
      confirmedReader: true,
      opens,
      headline: `Opened ${opens} times`,
      nextStep: 'Worth a call — it landed and it was read more than once.',
      score: Math.min(opens, SCORE_CEILING) + 5,
    };
  }

  return {
    band: 'delivered',
    // Never a confirmed reader. One fetch is one fetch, however late it
    // arrives — the whole argument of this module is that repetition is the
    // signal and a single open is proof of delivery. This is what decides
    // whether we may say "is reading it", and it is the only thing it decides.
    confirmedReader: false,
    // On the sheet regardless. An open is an open, and the business is worth
    // a dial even when the fetch was its mail server — see the note on this
    // field. What the speed of it changes is the ranking and the wording,
    // both of which are immediately below.
    callable: true,
    opens,
    headline: firstLooksAutomatic ? 'Opened once — on arrival' : 'Opened once',
    nextStep: firstLooksAutomatic
      ? 'Worth a call. Be aware the open was fast enough to be their mail server rather than them — it proves the address is live, which is more than most of your list.'
      : 'Worth a call — it landed and somebody opened it, though only once so far.',
    // Below every genuine reader, and a late open above a machine-speed one:
    // inside the opened band the order is the strength of the evidence.
    score: firstLooksAutomatic ? 1 : 3,
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
