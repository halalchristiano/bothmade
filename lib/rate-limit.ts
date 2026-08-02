import type { NextRequest } from 'next/server';

/**
 * Per-instance sliding-window rate limiting.
 *
 * Same tradeoff the contact form already accepts: this blunts credential
 * stuffing and casual abuse, and it resets on a serverless cold start. It
 * is not a substitute for a shared store — moving to Upstash Redis is
 * tracked separately — but "resets occasionally" beats "no limit at all"
 * on a login endpoint by a wide margin.
 */

type Window = { max: number; windowMs: number };

const buckets = new Map<string, Map<string, number[]>>();

function bucketFor(name: string): Map<string, number[]> {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = new Map();
    buckets.set(name, bucket);
  }
  return bucket;
}

/** The caller's IP, as best we can determine it behind a proxy. */
export function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (
    forwarded?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Records an attempt and reports whether the caller is over the limit.
 * Returns the seconds until the oldest attempt in the window ages out, so
 * the response can carry a truthful Retry-After.
 */
export function checkRateLimit(
  bucketName: string,
  key: string,
  { max, windowMs }: Window
): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = bucketFor(bucketName);
  const recent = (bucket.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    bucket.set(key, recent);
    const oldest = recent[0];
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  recent.push(now);
  bucket.set(key, recent);

  // Opportunistic sweep so a long-lived instance can't grow without bound.
  if (bucket.size > 5000) {
    for (const [k, times] of bucket) {
      if (times.every((t) => now - t >= windowMs)) bucket.delete(k);
    }
  }

  return { limited: false, retryAfterSeconds: 0 };
}

/** Forgets a key's history — call after a success so a good login resets the count. */
export function clearRateLimit(bucketName: string, key: string): void {
  bucketFor(bucketName).delete(key);
}

/** Login limits: generous enough for a forgetful human, useless for a script. */
export const LOGIN_LIMITS = {
  /** Per IP — catches one host spraying many accounts. */
  perIp: { max: 20, windowMs: 15 * 60 * 1000 },
  /** Per account — catches many hosts targeting one account. */
  perAccount: { max: 8, windowMs: 15 * 60 * 1000 },
} as const;
