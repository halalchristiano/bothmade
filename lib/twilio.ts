import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Calls placed through a phone network that reports back.
 *
 * ## What this is for
 *
 * Every other record of a call in this app is somebody's account of it. The
 * dial log got one step closer — it records that a number was tapped, with
 * nothing to press and no way to skip it — but the browser hands off to the
 * operating system and never hears another word. A number that rang out and a
 * twenty-minute conversation are identical to it.
 *
 * Routing the call through a carrier closes that. Twilio rings the rep's own
 * phone, bridges it to the lead, and then tells us what actually happened:
 * answered or not, and for how long. That is a measurement no amount of
 * good or bad intent can move.
 *
 * ## The shape, and why this shape
 *
 * Two legs. We ask Twilio to ring the REP first; when they pick up, Twilio
 * dials the LEAD and joins them. It reads backwards and it is the right way
 * round for a phone in a pocket:
 *
 *  - it works on the handset the rep already has, with no app, no browser
 *    microphone permission and nothing to install;
 *  - the rep is already on the line when the lead answers, so nobody hears
 *    dead air;
 *  - the result that matters — did the LEAD pick up — comes from the second
 *    leg, which Twilio reports separately from the first.
 *
 * The browser voice SDK would avoid the second leg's cost and needs a working
 * microphone, a foreground tab and a permission prompt, on a device that is
 * about to be held against somebody's face. Not for this team.
 *
 * ## Switched off by default
 *
 * Everything here answers "not configured" without credentials, and every
 * caller falls back to the plain `tel:` link. This is an upgrade to how calls
 * are placed, not a dependency the app acquires — a deployment with no Twilio
 * account has to keep working exactly as it did.
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** The number calls appear to come from. Must be one Twilio has issued us. */
  fromNumber: string;
}

export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

export function isTwilioConfigured(): boolean {
  return twilioConfig() !== null;
}

/**
 * A phone number in the only format a carrier accepts.
 *
 * The book is stored as people read it aloud — `(212) 555-0100` — because a
 * rep reads it back over the phone. Twilio wants `+12125550100` and rejects
 * anything else outright, so the conversion has to happen and it has to be
 * conservative: a number this cannot confidently turn into E.164 comes back
 * null and the call is refused, rather than being dialled somewhere nobody
 * intended.
 *
 * Ten digits are assumed North American, because that is the entire book. An
 * eleven-digit number starting 1 is the same thing written out. Anything
 * already in `+…` form is trusted as written.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    // E.164 allows up to 15 digits; under 8 is not a dialable number anywhere.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/**
 * Whether a webhook really came from Twilio.
 *
 * These endpoints are public by necessity — Twilio has to be able to reach
 * them — and one of them returns the instruction to dial a number. Without
 * this check anybody who found the URL could make our account ring any number
 * in the world at our expense, which is the entire reason toll fraud is a
 * category.
 *
 * The scheme is Twilio's: take the exact URL they requested, append every
 * POST parameter as key-then-value in alphabetical order, HMAC-SHA1 it with
 * the account's auth token, base64. Reimplemented rather than pulled from the
 * SDK because it is twenty lines that can be tested against known values, and
 * an untestable dependency guarding the money is a worse trade.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string
): boolean {
  if (!signature) return false;

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = createHmac('sha1', authToken).update(Buffer.from(payload, 'utf-8')).digest('base64');

  // Constant time, and length-checked first because timingSafeEqual throws on
  // a mismatch rather than returning false.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PlacedCall {
  sid: string;
  status: string;
}

/**
 * Rings the rep, and hands Twilio the address that will tell it what to do
 * when they pick up.
 *
 * `answerUrl` is fetched by Twilio at the moment the rep answers and must
 * return the TwiML that dials the lead. It is not called now, and it is
 * called by Twilio rather than by us — which is why it has to verify its own
 * signature rather than trusting that only we know the URL.
 */
export async function placeBridgedCall(input: {
  config: TwilioConfig;
  /** The rep's own handset, in E.164. */
  agentNumber: string;
  answerUrl: string;
  statusUrl: string;
}): Promise<PlacedCall> {
  const { config } = input;

  const body = new URLSearchParams({
    To: input.agentNumber,
    From: config.fromNumber,
    Url: input.answerUrl,
    StatusCallback: input.statusUrl,
    // 'completed' is the only one worth a round trip: the intermediate
    // states are already visible on the screen that placed the call.
    StatusCallbackEvent: 'completed',
    StatusCallbackMethod: 'POST',
    // Long enough for somebody to get the phone out of a pocket, short enough
    // that a rep who has walked away is not billed for a minute of ringing.
    Timeout: '25',
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Calls.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    }
  );

  const json = (await res.json().catch(() => null)) as
    | { sid?: string; status?: string; message?: string; code?: number }
    | null;

  if (!res.ok || !json?.sid) {
    // Twilio's own words. "The 'To' number is not a valid phone number" names
    // the fix; "the call failed" sends somebody hunting.
    throw new Error(json?.message || `Twilio refused the call (HTTP ${res.status})`);
  }

  return { sid: json.sid, status: json.status ?? 'queued' };
}

/**
 * What Twilio says happened, in words a rep would use.
 *
 * Kept as a mapping rather than shown raw because `no-answer` and
 * `in-progress` are fine in a log and wrong on a screen, and because these
 * strings end up next to outcomes somebody typed — they have to read like
 * they belong on the same page.
 */
export const CALL_STATUS_WORDS: Record<string, string> = {
  queued: 'Connecting…',
  initiated: 'Connecting…',
  ringing: 'Ringing them now',
  'in-progress': 'On the call',
  completed: 'Spoke to them',
  busy: 'Line was busy',
  'no-answer': 'No answer',
  failed: "Couldn't connect",
  canceled: 'Cancelled',
};

/** Whether the lead actually picked up. The only verdict worth a column. */
export function callWasAnswered(status: string, durationSeconds: number | null): boolean {
  // Twilio reports 'completed' for a call that rang out and was hung up as
  // well as one somebody spoke on, so duration is what separates them. Two
  // seconds is below any real conversation and above the click of a pickup
  // that was immediately cut off.
  return status === 'completed' && (durationSeconds ?? 0) > 2;
}
