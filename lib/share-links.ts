import crypto from 'crypto';

/**
 * Capability tokens for the two links we hand out with no login behind them:
 * a lead's sign-and-pay page and a project's public status page.
 *
 * Both used to be addressed by the row's cuid primary key, on the theory
 * that a cuid is unguessable. That isn't a security property: cuids are
 * time-seeded and partly sequential, they show up in admin URLs, Stripe
 * metadata, and activity records, and the same identifier that lets someone
 * *read* a proposal is the one that lets them *sign* it. A separate random
 * token makes the capability to view or sign a link its own thing — not
 * implied by ever having seen a record's ID, and revocable by updating the
 * column without touching anything else about the record.
 *
 * Generation lives in the database, as a `NOT NULL DEFAULT` on both tables
 * (see the migration). That's deliberate: leads and projects are created
 * from half a dozen places — CSV import, bulk actions, the Stripe webhook,
 * manual creation — and a default the database applies cannot be forgotten
 * by a new one, the way an application-side helper can.
 *
 * Tokens are compared in constant time so response timing can't be walked
 * character by character.
 */

/** Constant-time equality that tolerates length mismatches without throwing. */
export function shareTokenMatches(expected: string | null | undefined, provided: string | null | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Reads the capability token off a request — query string first, then header. */
export function readShareToken(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get(SHARE_TOKEN_PARAM);
  if (fromQuery) return fromQuery.trim();
  return request.headers.get('x-share-token')?.trim() || null;
}

export const SHARE_TOKEN_PARAM = 't';

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

/** The public sign-and-pay link for a lead. */
export function buildSignUrl(leadId: string, shareToken: string, origin?: string): string {
  return `${origin || siteUrl()}/sign/${leadId}?${SHARE_TOKEN_PARAM}=${shareToken}`;
}

/** The public read-only status link for a project. */
export function buildStatusUrl(projectId: string, shareToken: string, origin?: string): string {
  return `${origin || siteUrl()}/status/${projectId}?${SHARE_TOKEN_PARAM}=${shareToken}`;
}
