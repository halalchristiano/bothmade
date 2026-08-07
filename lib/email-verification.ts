/**
 * Checking an address before sending to it.
 *
 * Roughly three quarters of this book carries an address nobody ever saw
 * published — `info@` worked out from the company's domain because that is
 * right most of the time. Every wrong one is a hard bounce, bounce rate is
 * what gets a sending account restricted, and the sender could not tell a
 * guess from a verified address because both were just strings.
 *
 * This is the part that can tell them apart. ZeroBounce is the provider
 * behind it, but nothing outside this file knows that: the rest of the app
 * asks whether an address is safe to send to and gets an answer.
 *
 * WITHOUT AN API KEY. Every function here degrades to "no opinion" rather
 * than throwing. A missing key means verification is switched off, not that
 * sending is broken — the app worked before this existed and has to keep
 * working if the key is ever pulled.
 */

/** https://api.zerobounce.net/v2/validatebatch takes at most 200 at a time. */
export const VERIFY_BATCH_SIZE = 200;

/** The provider's own vocabulary, kept verbatim rather than mapped on the way in. */
export type VerificationStatus =
  | 'valid'
  | 'invalid'
  | 'catch-all'
  | 'unknown'
  | 'spamtrap'
  | 'abuse'
  | 'do_not_mail';

export interface VerificationResult {
  email: string;
  status: VerificationStatus;
  subStatus: string | null;
}

/**
 * The statuses that must never be sent to, and why each one is worse than a
 * bounce rather than merely useless:
 *
 *  - `invalid`   the mailbox does not exist. A hard bounce, which is the
 *                thing that restricted the account in the first place.
 *  - `spamtrap`  an address kept alive specifically to catch senders who did
 *                not verify. Hitting one is the single fastest route to a
 *                domain-level blocklist, and it never bounces to warn you.
 *  - `abuse`     a recipient with a history of pressing "report spam". A
 *                complaint costs far more than a bounce.
 *  - `do_not_mail` the provider's own suppression: role accounts, known
 *                litigators, toxic domains.
 */
const NEVER_SEND: ReadonlySet<string> = new Set(['invalid', 'spamtrap', 'abuse', 'do_not_mail']);

/**
 * Whether a verified address may be sent to.
 *
 * `catch-all` and `unknown` are allowed through on purpose. A catch-all
 * domain accepts everything, so the verifier genuinely cannot tell — and a
 * great many small businesses run one, which is most of this book. Refusing
 * them would throw away more real prospects than it would save bounces.
 * `unknown` means the check itself failed to complete, which is a statement
 * about the verifier and not about the address.
 *
 * Both are ranked below `valid` when a batch is ordered, which is where that
 * uncertainty belongs — see lib/send-safety.ts.
 */
export function isSendableStatus(status: string | null | undefined): boolean {
  if (!status) return true; // never checked — not the same as checked and bad
  return !NEVER_SEND.has(status);
}

/** True only for an address a verifier actively confirmed. */
export function isVerifiedGood(status: string | null | undefined): boolean {
  return status === 'valid';
}

export function isVerificationConfigured(): boolean {
  return !!process.env.ZEROBOUNCE_API_KEY;
}

interface ZeroBounceRow {
  address?: string;
  status?: string;
  sub_status?: string;
  error?: string;
}

/**
 * Verify up to VERIFY_BATCH_SIZE addresses in one call.
 *
 * Returns a map keyed by lowercased address. An address the provider says
 * nothing about is simply absent from the map — the caller must treat that as
 * "still unverified" rather than inventing a verdict for it, which is why
 * this returns a map rather than an array the caller would zip by index.
 *
 * Throws on a transport or credit failure. That is deliberate: the caller
 * about to send a thousand cold emails needs to know the check did not
 * happen, and a silent empty map reads exactly like "everything is fine".
 */
export async function verifyBatch(emails: string[]): Promise<Map<string, VerificationResult>> {
  const apiKey = process.env.ZEROBOUNCE_API_KEY;
  if (!apiKey) throw new Error('Email verification is not configured (ZEROBOUNCE_API_KEY is unset)');
  if (emails.length === 0) return new Map();
  if (emails.length > VERIFY_BATCH_SIZE) {
    throw new Error(`verifyBatch takes at most ${VERIFY_BATCH_SIZE} addresses at a time`);
  }

  const res = await fetch('https://api.zerobounce.net/v2/validatebatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      email_batch: emails.map((email) => ({ email_address: email, ip_address: null })),
    }),
    // The provider documents up to 70 seconds for a full batch. Anything past
    // that is a hung request, not a slow one.
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    throw new Error(`Email verification failed (HTTP ${res.status})`);
  }

  const body = (await res.json()) as { email_batch?: ZeroBounceRow[]; errors?: unknown[] };

  // A per-address error is not a verdict. Left out of the map so the address
  // stays unverified and gets another chance, rather than being recorded as
  // something the provider never said.
  const out = new Map<string, VerificationResult>();
  for (const row of body.email_batch ?? []) {
    if (!row.address || !row.status || row.error) continue;
    out.set(row.address.toLowerCase(), {
      email: row.address,
      status: row.status as VerificationStatus,
      subStatus: row.sub_status || null,
    });
  }
  return out;
}

/** Credits left, or null when it cannot be determined. Never throws. */
export async function remainingCredits(): Promise<number | null> {
  const apiKey = process.env.ZEROBOUNCE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.zerobounce.net/v2/getcredits?api_key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { Credits?: string | number };
    const credits = Number(body?.Credits);
    // The API answers -1 for an invalid key, which is not a credit balance.
    return Number.isFinite(credits) && credits >= 0 ? credits : null;
  } catch {
    return null;
  }
}
