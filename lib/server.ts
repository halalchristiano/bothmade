import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { Resend } from 'resend';

/**
 * The handful of things every form endpoint needs. Extracted when the
 * estimator arrived and would otherwise have copy-pasted the contact route's
 * escaping and rate limiting — two places to fix a security bug is one too
 * many.
 */

/**
 * The mail client, built on first use rather than at import time.
 *
 * `new Resend(undefined)` throws, and a route that does it at module scope
 * takes the whole production build down with it during page-data collection —
 * which is exactly what happened before this existed. Constructing lazily means
 * a build (or a preview deploy, or a CI run) without `RESEND_API_KEY` succeeds,
 * and the missing key surfaces as a handled 500 on the one request that needed
 * it. Routes still check for the key themselves before sending.
 */
let resendClient: Resend | null = null;

export function getResend(): Resend {
  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

/** Anything user-supplied is escaped before it reaches an HTML email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isValidEmail(value: string): boolean {
  // Deliberately conservative: no display names, no comments, no newlines.
  return /^[^\s@<>"']+@[^\s@<>"'.]+\.[^\s@<>"']{2,}$/.test(value);
}

/**
 * Per-instance sliding window. Serverless means this resets on cold start and
 * isn't shared across instances — it blunts casual abuse, not a determined
 * attacker. Move to Upstash/Redis if these endpoints ever get targeted.
 *
 * Each caller gets its own window and its own map, so a burst of estimates
 * can't lock someone out of the contact form.
 */
export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return function isRateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (recent.length >= max) {
      hits.set(key, recent);
      return true;
    }

    recent.push(now);
    hits.set(key, recent);

    // Opportunistic cleanup so the map can't grow without bound.
    if (hits.size > 5000) {
      for (const [k, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }

    return false;
  };
}

export function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** The shared wrapper every outgoing email sits inside. */
export function emailShell(inner: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">${inner}<hr style="border:none;border-top:1px solid #eee;margin:30px 0;"><p style="color:#999;font-size:12px;">© 2026 Bothmade</p></div>`;
}

/**
 * Guards the studio-only endpoints. Compared in constant time because a
 * timing oracle on an admin secret is a real, if unglamorous, way in.
 */
export function isAdmin(request: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected || expected.length < 24) return false;

  const provided = request.headers.get('x-admin-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

/** Trim, cap, and guarantee a string back — the shape every text field needs. */
export function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
