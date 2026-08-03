import { NextResponse } from 'next/server';

/**
 * Rate limiter for the endpoints where unlimited attempts are the whole
 * attack: login, admin login, signup, password reset, and the public
 * sign-and-pay POST.
 *
 * Two backends, chosen at runtime:
 *
 *  - **Upstash Redis**, when UPSTASH_REDIS_REST_URL and
 *    UPSTASH_REDIS_REST_TOKEN are set. Counters are then shared across every
 *    serverless instance, so the published limits are the real limits.
 *    Spoken to over its REST API with plain `fetch` — no client library, no
 *    connection pool to manage from a function that may be frozen mid-call.
 *  - **In-process**, otherwise. Counts per instance, so an attacker spread
 *    across cold starts gets more attempts than the numbers below suggest.
 *    It still stops the case that actually happens — one client hammering
 *    one warm instance with a credential list — and it needs no extra
 *    infrastructure to stand up.
 *
 * **On Redis failure the limiter falls back to the in-process counter rather
 * than failing open or closed.** Failing open would drop throttling on the
 * login endpoint exactly when infrastructure is already unhealthy; failing
 * closed would lock every user out of the product because a cache blipped.
 * Degrading to the local counter keeps a real limit in force either way.
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

interface RedisConfig {
  url: string;
  token: string;
}

function redisConfig(): RedisConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/** Set once per process after the first Redis failure, to stop hammering a sick backend. */
let redisDisabledUntil = 0;
const REDIS_COOLDOWN_MS = 30_000;

interface PipelineResult {
  result?: unknown;
  error?: string;
}

async function redisPipeline(config: RedisConfig, commands: Array<Array<string | number>>): Promise<unknown[]> {
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    // A limiter must never be the reason a request hangs. If Redis can't
    // answer in a second, use the local counter and move on.
    signal: AbortSignal.timeout(1000),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Upstash responded ${response.status}`);

  const body = (await response.json()) as PipelineResult[];
  if (!Array.isArray(body)) throw new Error('Upstash returned an unexpected body');

  return body.map((entry) => {
    if (entry?.error) throw new Error(entry.error);
    return entry?.result;
  });
}

/**
 * INCR the counter, give it an expiry the first time only, and read what's
 * left of that expiry — one round trip.
 *
 * PEXPIRE ... NX is what makes this a fixed window: the TTL is set by the
 * request that creates the key and is never pushed back, so a caller can't
 * hold a key alive forever by continuing to hit it.
 */
async function hitRedis(
  config: RedisConfig,
  key: string,
  { limit, windowMs }: RateLimitOptions
): Promise<RateLimitResult> {
  const [rawCount, , rawTtl] = await redisPipeline(config, [
    ['INCR', key],
    ['PEXPIRE', key, windowMs, 'NX'],
    ['PTTL', key],
  ]);

  const count = Number(rawCount);
  const ttlMs = Number(rawTtl);
  // PTTL returns -1 when the key somehow has no expiry; treat that as a full
  // window rather than reporting a negative retry-after.
  const retryAfterSeconds = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000));

  if (!Number.isFinite(count)) throw new Error('Upstash returned a non-numeric count');

  return count > limit || limit < 1
    ? { ok: false, remaining: 0, retryAfterSeconds }
    : { ok: true, remaining: limit - count, retryAfterSeconds: 0 };
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
 * In-process fixed window: the first request starts the clock, and
 * everything past `limit` inside it is rejected. Used directly when no Redis
 * is configured, and as the fallback when Redis is unreachable.
 */
export function hitLocal(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
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

/**
 * Records one attempt against `key` and reports whether it's allowed,
 * against whichever backend is configured.
 */
export async function hit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const config = redisConfig();

  if (config && Date.now() >= redisDisabledUntil) {
    try {
      return await hitRedis(config, key, options);
    } catch (error) {
      redisDisabledUntil = Date.now() + REDIS_COOLDOWN_MS;
      console.error('[rate-limit] Redis unavailable, falling back to the in-process counter:', error);
    }
  }

  return hitLocal(key, options);
}

/** Clears a key's counter — call after a *successful* login so one typo-then-success doesn't count against the user. */
export async function reset(key: string): Promise<void> {
  buckets.delete(key);

  const config = redisConfig();
  if (!config || Date.now() < redisDisabledUntil) return;

  // Best effort: a counter that fails to clear only costs the user their
  // remaining attempts in this window, so it must not fail the request.
  await redisPipeline(config, [['DEL', key]]).catch(() => undefined);
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
export async function enforce(
  checks: Array<{ key: string; options: RateLimitOptions; message?: string }>
): Promise<NextResponse | null> {
  for (const check of checks) {
    const result = await hit(check.key, check.options);
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
