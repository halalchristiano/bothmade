import { NextResponse } from 'next/server';

/**
 * Small in-process rate limiter for the endpoints where unlimited attempts
 * are the whole attack: login, admin login, password reset, and the public
 * sign-and-pay POST.
 *
 * Scope, stated plainly: this counts per serverless instance, not globally.
 * On Vercel that means a determined attacker spread across many cold starts
 * gets more attempts than the numbers below suggest. It still removes the
 * thing that actually matters — a single client hammering one warm instance
 * with a credential list — and it needs no extra infrastructure. If this
 * ever needs to be exact, swap `hit()` for a Redis INCR with the same
 * signature and every call site keeps working.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Bounded so a flood of unique keys (one per source IP) can't grow the map
// without limit. Eviction is oldest-reset-first, which drops the entries
// closest to expiring anyway.
const MAX_TRACKED_KEYS = 10_000;

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size <= MAX_TRACKED_KEYS) return;

  const sorted = Array.from(buckets.entries()).sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (const [key] of sorted.slice(0, buckets.size - MAX_TRACKED_KEYS)) {
    buckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** Attempts allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Records one attempt against `key` and reports whether it's allowed.
 * Fixed window: the first request starts the clock, and everything past
 * `limit` inside it is rejected.
 */
export function hit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();

  // Cleanup runs inline rather than on a timer — a serverless instance can
  // be frozen mid-interval, and a leaked timer is worse than a stale entry.
  if (buckets.size > MAX_TRACKED_KEYS / 2) prune(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // A limit of zero means "never" — the fresh-bucket path has to honour
    // that too, or the first request of every window sails through.
    return limit < 1
      ? { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)) }
      : { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { ok: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Clears a key's counter — call after a *successful* login so one typo-then-success doesn't count against the user. */
export function reset(key: string): void {
  buckets.delete(key);
}

/**
 * Best-effort client IP. On Vercel `x-forwarded-for` is set by the platform
 * edge and the left-most entry is the real client; the header is spoofable
 * in other deployments, which is why this is one input to the key rather
 * than the only one.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Builds a limiter key from the route, the caller's IP, and optionally the
 * identity being targeted. Including the identity means an attacker can't
 * rotate IPs to get unlimited guesses at one specific account.
 */
export function limiterKey(scope: string, request: Request, identity?: string | null): string {
  const id = identity ? identity.trim().toLowerCase().slice(0, 200) : '';
  return `${scope}:${clientIp(request)}:${id}`;
}

/** The 429 to return when a limiter rejects. */
export function tooManyRequests(result: RateLimitResult, message?: string): NextResponse {
  return NextResponse.json(
    {
      error:
        message ||
        `Too many attempts. Try again in ${result.retryAfterSeconds} second${result.retryAfterSeconds === 1 ? '' : 's'}.`,
    },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
  );
}

/**
 * Applies every limiter for a request and returns a 429 response if any of
 * them rejects, or null to continue. Pass both a per-IP and a per-identity
 * limit so neither dimension alone gives unlimited attempts.
 */
export function enforce(
  checks: Array<{ key: string; options: RateLimitOptions; message?: string }>
): NextResponse | null {
  for (const check of checks) {
    const result = hit(check.key, check.options);
    if (!result.ok) return tooManyRequests(result, check.message);
  }
  return null;
}

/** Shared presets, so the numbers live in one place. */
export const LIMITS = {
  /** Password guessing against one account, or from one address. */
  login: { limit: 8, windowMs: 10 * 60 * 1000 },
  /** Reset emails are outbound mail we pay for — keep this tight. */
  passwordResetRequest: { limit: 4, windowMs: 60 * 60 * 1000 },
  /** Guessing a 32-byte reset token is hopeless, but don't help. */
  passwordResetSubmit: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** Account creation, wherever it's allowed at all. */
  signup: { limit: 3, windowMs: 60 * 60 * 1000 },
  /** Unauthenticated writes on public share links. */
  publicWrite: { limit: 10, windowMs: 10 * 60 * 1000 },
  /** Unauthenticated reads on public share links. */
  publicRead: { limit: 60, windowMs: 10 * 60 * 1000 },
} as const;
