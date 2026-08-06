import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';

/**
 * One rate limiter for every public endpoint.
 *
 * Two copies of a per-instance sliding window lived in /api/contact and
 * /api/start/interest, and the endpoints that actually needed one — the
 * login, signup and password-reset routes — had none at all, leaving an
 * unauthenticated brute-force path into a CRM holding client contact
 * details and payment records.
 *
 * The counter lives in Postgres, in the same database the app already has a
 * connection to on every one of these routes. A per-process counter is
 * worthless on serverless — a cold start hands the caller a fresh budget —
 * and reaching for a second datastore to hold a handful of integers means
 * another service to provision, pay for and watch. One indexed upsert is
 * noise next to the queries these routes already run.
 *
 * A per-instance window remains as the fallback for when the database is
 * unreachable, so an outage degrades the limit rather than either locking
 * everyone out or waving everyone through.
 */

export interface RateLimitRule {
  /** Requests allowed inside the window. */
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry. 0 when allowed. */
  retryAfterSeconds: number;
  /** Which store answered — surfaced for tests and for logging. */
  store: 'db' | 'memory';
}

/** Sensible defaults, named so the intent of each number is visible at the call site. */
export const RATE_LIMITS = {
  /** Credential guessing. Deliberately tight — a real person mistypes a password twice, not ten times. */
  login: { max: 8, windowMs: 10 * 60 * 1000 },
  /** Unauthenticated reads on a public share link (proposal, project status). */
  publicRead: { max: 60, windowMs: 10 * 60 * 1000 },
  /** Unauthenticated writes on a public share link — agree-and-pay renders a PDF and opens a Stripe session per call. */
  publicWrite: { max: 10, windowMs: 10 * 60 * 1000 },
  /** Account creation from one address. */
  signup: { max: 5, windowMs: 60 * 60 * 1000 },
  /** Reset mail is sent to someone else's inbox, so this is an abuse vector even when it "fails". */
  passwordReset: { max: 5, windowMs: 60 * 60 * 1000 },
  /** Contact form — unchanged from what it enforced before. */
  contact: { max: 3, windowMs: 10 * 60 * 1000 },
  /** Quote/interest submissions — unchanged. */
  interest: { max: 5, windowMs: 10 * 60 * 1000 },
  /**
   * The brief form a client is emailed after enquiring.
   *
   * Its own budget rather than sharing the contact form's, because the two
   * happen back to back on purpose: somebody enquires, gets the form in the
   * same minute, and fills it in. On the contact form's budget of three, the
   * enquiry itself spends one and a single correction to an answer spends the
   * rest — so the person we just asked to answer is told to try again later.
   *
   * Looser than contact, too. Writing on the form requires holding a lead's
   * unguessable token, so this is not an open endpoint; the limit is here to
   * stop a runaway retry, not to keep strangers out.
   */
  briefForm: { max: 12, windowMs: 10 * 60 * 1000 },
  /**
   * Tidying a call note. Staff-only and already behind a login, so this is
   * not about abuse — it is the one endpoint in the app that bills per
   * request, and a stuck retry loop on a page someone left open should cost
   * pennies rather than run all night. Set well above what a person
   * finishing calls could ever press.
   */
  tidyNote: { max: 40, windowMs: 10 * 60 * 1000 },
  /**
   * Failed sign-ins against one account, whatever address they come from.
   *
   * `login` above is keyed on the caller's IP, which is the wrong shape for
   * the attack that matters here: someone grinding one known address from a
   * proxy pool or botnet never spends a single IP's budget, so the per-IP
   * limit never fires. This one is keyed on the account.
   *
   * Only failures count and a success clears the record, so the studio
   * signing in twenty times a day is never throttled by its own use — the
   * count only moves when somebody is getting the password wrong.
   *
   * 10 is deliberately looser than the per-IP 8: this budget can be spent by
   * a stranger, and spending it locks a real person out for the window. That
   * is the accepted cost, and it is bounded to fifteen minutes.
   */
  loginAccount: { max: 10, windowMs: 15 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

const hits = new Map<string, number[]>();

/** Exported for tests — nothing in the app should need to reach for this. */
export function __resetInMemoryRateLimits() {
  hits.clear();
}

function checkInMemory(key: string, rule: RateLimitRule, now: number): RateLimitResult {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);

  if (recent.length >= rule.max) {
    hits.set(key, recent);
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
      store: 'memory',
    };
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic sweep so the map can't grow without bound on a long-lived
  // instance being probed with a rotating set of addresses.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= rule.windowMs)) hits.delete(k);
    }
  }

  return { allowed: true, retryAfterSeconds: 0, store: 'memory' };
}

// ---------------------------------------------------------------------------
// Postgres store
// ---------------------------------------------------------------------------

interface CounterRow {
  count: number;
  windowStart: Date;
}

/**
 * Counts one hit and returns the resulting window, in a single statement.
 *
 * Everything happens inside one `INSERT ... ON CONFLICT DO UPDATE`, which
 * takes a row lock, so two instances racing on the same key cannot both read
 * the same count and each let a request through. Doing this as a read then a
 * write would be exactly that race, and the race is the whole attack.
 *
 * A window that has already lapsed resets to 1 rather than being deleted and
 * re-inserted, which keeps it to the one statement.
 */
async function checkDatabase(key: string, rule: RateLimitRule): Promise<RateLimitResult | null> {
  try {
    const rows = await prisma.$queryRaw<CounterRow[]>`
      INSERT INTO "rate_limits" ("key", "count", "windowStart")
      VALUES (${key}, 1, NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limits"."windowStart" <= NOW() - ${rule.windowMs}::double precision * INTERVAL '1 millisecond'
            THEN 1
          ELSE "rate_limits"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "rate_limits"."windowStart" <= NOW() - ${rule.windowMs}::double precision * INTERVAL '1 millisecond'
            THEN NOW()
          ELSE "rate_limits"."windowStart"
        END
      RETURNING "count", "windowStart"
    `;

    const row = rows[0];
    if (!row || typeof row.count !== 'number') return null;

    if (row.count <= rule.max) {
      void sweepLapsedRows();
      return { allowed: true, retryAfterSeconds: 0, store: 'db' };
    }

    const elapsed = Date.now() - new Date(row.windowStart).getTime();
    const remainingMs = Math.max(0, rule.windowMs - elapsed);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      store: 'db',
    };
  } catch (error) {
    console.error('[rate-limit] database counter failed:', error);
    return null;
  }
}

/**
 * Deletes rows nothing will read again. Runs on roughly one request in two
 * hundred and is never awaited, so it costs the caller nothing; the table
 * would otherwise accumulate a row per address seen, forever.
 *
 * The 24h cutoff is far longer than the longest window, so this can never
 * delete a counter that is still holding somebody back.
 */
let sweeping = false;
async function sweepLapsedRows(): Promise<void> {
  if (sweeping || Math.random() > 0.005) return;
  sweeping = true;
  try {
    await prisma.rateLimit.deleteMany({
      where: { windowStart: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  } catch {
    // Housekeeping — a failure here must never affect the request.
  } finally {
    sweeping = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records one request against `key` and says whether it may proceed.
 *
 * `key` should identify both the caller and the endpoint, so a login attempt
 * doesn't spend the caller's contact-form budget — `rateLimitKey()` builds it.
 */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const result = await checkDatabase(key, rule);
  if (result) return result;

  // The database is unreachable. Most of these routes are about to fail
  // anyway, but degrading to the per-instance window keeps some limit in
  // place rather than turning a database blip into an open door.
  console.warn('[rate-limit] falling back to the in-memory window');
  return checkInMemory(key, rule, Date.now());
}

/**
 * The caller's address, as reported by the platform's proxy. Falls back to a
 * shared "unknown" bucket, which is intentionally strict: a request we can't
 * attribute shares one budget with every other unattributable request.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** Namespaced key, so each endpoint gets its own budget per caller. */
export function rateLimitKey(scope: string, request: NextRequest): string {
  return `rl:${scope}:${clientIp(request)}`;
}

// ---------------------------------------------------------------------------
// Failure counters
// ---------------------------------------------------------------------------

/**
 * A budget keyed on *who is being signed in to*, not on who is asking.
 *
 * Lower-cased and trimmed so `Kiana@…` and `kiana@…` share one budget — an
 * attacker must not get a fresh allowance by varying the capitalisation.
 */
export function accountKey(scope: string, identifier: string): string {
  return `rl:${scope}:acct:${identifier.trim().toLowerCase()}`;
}

/**
 * Whether this account is currently locked out, *without* spending any of its
 * budget. Asked before the password is checked; the counter only moves on a
 * failure, which is what `recordFailure` is for.
 */
export async function checkFailures(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  try {
    const rows = await prisma.$queryRaw<CounterRow[]>`
      SELECT "count", "windowStart" FROM "rate_limits" WHERE "key" = ${key}
    `;
    const row = rows[0];
    if (!row) return { allowed: true, retryAfterSeconds: 0, store: 'db' };

    const elapsed = Date.now() - new Date(row.windowStart).getTime();
    // A lapsed window is not a lockout — it just hasn't been cleaned up yet.
    if (elapsed >= rule.windowMs) return { allowed: true, retryAfterSeconds: 0, store: 'db' };
    if (row.count < rule.max) return { allowed: true, retryAfterSeconds: 0, store: 'db' };

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((rule.windowMs - elapsed) / 1000)),
      store: 'db',
    };
  } catch (error) {
    // Fails open, deliberately. A throttle that locks the studio out of its
    // own dashboard during a database blip causes a certain outage to prevent
    // a hypothetical attack — and the per-IP limit is still in force.
    console.error('[rate-limit] account check failed, allowing attempt:', error);
    return { allowed: true, retryAfterSeconds: 0, store: 'memory' };
  }
}

/** Counts one failed attempt. Never throws — logging must not break login. */
export async function recordFailure(key: string, rule: RateLimitRule): Promise<void> {
  try {
    await checkRateLimit(key, rule);
  } catch (error) {
    console.error('[rate-limit] could not record a failed attempt:', error);
  }
}

/** A correct password clears the account's failures. Never throws. */
export async function clearFailures(key: string): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { key } });
  } catch (error) {
    console.error('[rate-limit] could not clear failures:', error);
  }
  hits.delete(key);
}

/**
 * The 429. Carries `Retry-After` so a well-behaved client backs off for the
 * right amount of time instead of hammering, which the previous inline
 * responses never told it.
 */
export function rateLimitResponse(result: RateLimitResult, message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    }
  );
}

/**
 * The whole check in one call for the common case. Returns a ready-to-return
 * 429 when the caller is over the limit, or null when they may proceed.
 */
export async function enforceRateLimit(
  request: NextRequest,
  scope: string,
  rule: RateLimitRule,
  message: string
): Promise<NextResponse | null> {
  const result = await checkRateLimit(rateLimitKey(scope, request), rule);
  return result.allowed ? null : rateLimitResponse(result, message);
}
