import { NextRequest, NextResponse } from 'next/server';

/**
 * One rate limiter for every public endpoint.
 *
 * Two copies of a per-instance sliding window lived in /api/contact and
 * /api/start/interest, and the endpoints that actually needed one — the
 * login, signup and password-reset routes — had none at all, leaving an
 * unauthenticated brute-force path into a CRM holding client contact
 * details and payment records.
 *
 * The store is chosen at call time:
 *
 *  - Upstash Redis over its REST API when `UPSTASH_REDIS_REST_URL` and
 *    `UPSTASH_REDIS_REST_TOKEN` are set. Shared across every serverless
 *    instance and survives cold starts, which is the only way a limit on a
 *    platform like Vercel means anything. No SDK — it's one fetch.
 *  - An in-memory sliding window otherwise, and whenever Redis is
 *    unreachable. Weaker (per-instance, resets on cold start) but it keeps
 *    working with no configuration, and it degrades rather than either
 *    locking everyone out or waving everyone through.
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
  store: 'redis' | 'memory';
}

/** Sensible defaults, named so the intent of each number is visible at the call site. */
export const RATE_LIMITS = {
  /** Credential guessing. Deliberately tight — a real person mistypes a password twice, not ten times. */
  login: { max: 8, windowMs: 10 * 60 * 1000 },
  /** Account creation from one address. */
  signup: { max: 5, windowMs: 60 * 60 * 1000 },
  /** Reset mail is sent to someone else's inbox, so this is an abuse vector even when it "fails". */
  passwordReset: { max: 5, windowMs: 60 * 60 * 1000 },
  /** Contact form — unchanged from what it enforced before. */
  contact: { max: 3, windowMs: 10 * 60 * 1000 },
  /** Quote/interest submissions — unchanged. */
  interest: { max: 5, windowMs: 10 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

// ---------------------------------------------------------------------------
// In-memory store
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
// Redis store
// ---------------------------------------------------------------------------

/** How long to wait on Redis before giving up and using the local window. */
const REDIS_TIMEOUT_MS = 1500;

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

/** True when a durable store is configured — useful for a health check or a startup log. */
export function hasDurableRateLimitStore(): boolean {
  return redisConfig() !== null;
}

/**
 * Fixed window via INCR + PEXPIRE NX, which is atomic in one round trip.
 * A fixed window permits up to 2× the limit across a window boundary; for
 * slowing down credential guessing that is an acceptable trade for not
 * needing a Lua script or a sorted set per key.
 */
async function checkRedis(
  key: string,
  rule: RateLimitRule,
  config: { url: string; token: string }
): Promise<RateLimitResult | null> {
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['PEXPIRE', key, String(rule.windowMs), 'NX'],
        ['PTTL', key],
      ]),
      // Never let a slow limiter become the slowest part of a login.
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const body = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(body) || body.length < 3 || body.some((step) => step?.error)) return null;

    const count = Number(body[0]?.result);
    const pttl = Number(body[2]?.result);
    if (!Number.isFinite(count)) return null;

    if (count <= rule.max) {
      return { allowed: true, retryAfterSeconds: 0, store: 'redis' };
    }

    // A missing or already-expired TTL shouldn't produce a nonsense header.
    const remainingMs = Number.isFinite(pttl) && pttl > 0 ? pttl : rule.windowMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      store: 'redis',
    };
  } catch {
    // Timeout, DNS failure, malformed body — fall through to the local window.
    return null;
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
  const config = redisConfig();
  if (config) {
    const result = await checkRedis(key, rule, config);
    if (result) return result;
    // Redis is configured but unreachable. Degrading to the per-instance
    // window keeps some protection in place; refusing every request would
    // turn a cache outage into a total outage.
    console.warn('[rate-limit] Redis unavailable, falling back to in-memory window');
  }
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
