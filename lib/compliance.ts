import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { escapeHtml } from '@/lib/html';

/**
 * CAN-SPAM and one-click unsubscribe.
 *
 * Cold outreach to businesses is legal in the US, and it comes with three
 * non-negotiable obligations that this codebase was not meeting: a working
 * opt-out in every message, a valid physical postal address in every
 * message, and honouring an opt-out within ten business days. Gmail and
 * Yahoo additionally require RFC 8058 one-click unsubscribe headers from
 * bulk senders — without them, mail to their users gets throttled or
 * dropped regardless of what the law says.
 *
 * Fines are per-message. At a few hundred cold emails a week, "we'll add it
 * later" is the expensive option.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://bothmade.studio';

/**
 * The physical mailing address printed in every outbound email.
 *
 * CAN-SPAM requires a valid physical postal address — a street address, or
 * a registered PO box / commercial mail-receiving agency. Set
 * BOTHMADE_POSTAL_ADDRESS in the environment; the placeholder below is
 * deliberately obviously wrong so it can't quietly ship as if it were real.
 */
export const POSTAL_ADDRESS =
  process.env.BOTHMADE_POSTAL_ADDRESS ||
  'Bothmade — POSTAL ADDRESS NOT CONFIGURED (set BOTHMADE_POSTAL_ADDRESS)';

export function isPostalAddressConfigured(): boolean {
  return Boolean(process.env.BOTHMADE_POSTAL_ADDRESS);
}

const TOKEN_KEY = crypto
  .createHash('sha256')
  .update(`${process.env.SESSION_SECRET || 'bothmade-dev-secret'}:unsubscribe`)
  .digest();

/**
 * A signed token identifying one address. HMAC rather than a random token
 * in a table, so an unsubscribe link works without a prior database write
 * and can't be enumerated — and so honouring it never depends on us having
 * remembered to persist something first.
 */
export function unsubscribeToken(email: string): string {
  const normalized = email.trim().toLowerCase();
  const mac = crypto
    .createHmac('sha256', TOKEN_KEY)
    .update(normalized)
    .digest('base64url')
    .slice(0, 32);
  return `${Buffer.from(normalized).toString('base64url')}.${mac}`;
}

/** Returns the address a token vouches for, or null if it doesn't verify. */
export function verifyUnsubscribeToken(token: string): string | null {
  const [encoded, mac] = token.split('.');
  if (!encoded || !mac) return null;
  let email: string;
  try {
    email = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = unsubscribeToken(email).split('.')[1];
  // Length check first: timingSafeEqual throws on a mismatch.
  if (mac.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? email : null;
}

export function unsubscribeUrl(email: string): string {
  return `${SITE_URL}/api/unsubscribe?token=${unsubscribeToken(email)}`;
}

/**
 * Headers that make the client's own "Unsubscribe" button work.
 * List-Unsubscribe-Post is what turns it into RFC 8058 one-click — without
 * it Gmail shows the link but treats us as a worse sender.
 */
export function unsubscribeHeaders(email: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl(email)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Places the footer inside the document rather than after `</html>`.
 * Most clients tolerate trailing markup, but "most" is not a standard worth
 * betting the required disclosure on.
 */
export function withComplianceFooter(
  html: string,
  email: string,
  opts?: { dark?: boolean }
): string {
  const footer = complianceFooterHtml(email, opts);
  const closingBody = html.lastIndexOf('</body>');
  if (closingBody !== -1) {
    return html.slice(0, closingBody) + footer + html.slice(closingBody);
  }
  return html + footer;
}

/** The visible footer block. Appended to the body of every outbound email. */
export function complianceFooterHtml(email: string, opts?: { dark?: boolean }): string {
  const dim = opts?.dark ? 'rgba(255,255,255,0.3)' : '#999999';
  const link = opts?.dark ? 'rgba(255,255,255,0.55)' : '#666666';
  return `
    <div style="margin-top:28px; padding-top:16px; border-top:1px solid ${
      opts?.dark ? 'rgba(255,255,255,0.1)' : '#e5e5e5'
    }; font-size:11px; line-height:1.6; color:${dim};">
      <p style="margin:0 0 4px 0;">${escapeHtml(POSTAL_ADDRESS)}</p>
      <p style="margin:0;">
        <a href="${unsubscribeUrl(email)}" style="color:${link}; text-decoration:underline;">Unsubscribe</a>
        — you will not be emailed by us again.
      </p>
    </div>`;
}

/**
 * Whether we are allowed to email this address at all.
 *
 * Checked immediately before every send rather than at list-build time,
 * because the gap between building a batch and sending it is exactly where
 * a fresh opt-out gets missed.
 */
export async function isSuppressed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return true;
  try {
    const row = await prisma.emailSuppression.findUnique({ where: { email: normalized } });
    return Boolean(row);
  } catch (error) {
    // A suppression check that errors must fail closed for bulk mail, but
    // this helper is shared with transactional mail where that would block
    // a client's password. Callers decide; we report "not suppressed" and
    // log loudly, and the bulk paths do their own guarded check.
    console.error('Suppression lookup failed:', error);
    return false;
  }
}

/** Filters a recipient list down to addresses we may still contact. */
export async function removeSuppressed(emails: string[]): Promise<string[]> {
  const normalized = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return [];
  const rows = await prisma.emailSuppression.findMany({
    where: { email: { in: normalized } },
    select: { email: true },
  });
  const blocked = new Set(rows.map((r) => r.email));
  return emails.filter((e) => !blocked.has(e.trim().toLowerCase()));
}

export async function suppress(
  email: string,
  reason: 'unsubscribe' | 'complaint' | 'bounce' | 'manual',
  source?: string
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  await prisma.emailSuppression.upsert({
    where: { email: normalized },
    update: { reason, source: source ?? undefined },
    create: { email: normalized, reason, source: source ?? null },
  });
}
