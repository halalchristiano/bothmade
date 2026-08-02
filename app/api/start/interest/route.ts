import { NextRequest, NextResponse } from 'next/server';
import { renderShell, sendEmail } from '@/lib/email';
import { BOOKING_LABEL, BOOKING_URL } from '@/lib/booking';
import { configurationRows, recordInboundLead } from '@/lib/inbound-leads';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  formatCents,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  type AddOnKey,
} from '@/lib/pricing';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.CONTACT_EMAIL || 'contact@bothmade.com';

/**
 * Per-instance sliding window — same tradeoff as /api/contact: blunts casual
 * abuse, resets on cold start, not meant to stop a determined attacker.
 */
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
const hits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT.windowMs)) hits.delete(k);
    }
  }
  return false;
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LIMITS = { name: 100, email: 254, company: 120, phone: 40 } as const;

/** Trims and bounds a free-text field; anything non-string becomes ''. */
function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Same conservative shape /api/contact accepts — no display names, no newlines. */
function isValidEmail(value: string): boolean {
  return /^[^\s@<>"']+@[^\s@<>"'.]+\.[^\s@<>"']{2,}$/.test(value);
}

/**
 * Emails the buyer a recap of exactly what they configured — the line items,
 * the number, and the two links worth having (re-open the calculator, or
 * book a call). Best-effort: the studio already has the enquiry, so a bounce
 * here must not fail the request.
 */
async function sendBuyerRecap({
  email,
  contactName,
  company,
  config,
  total,
}: {
  email: string;
  contactName: string;
  company: string;
  config: Parameters<typeof configurationRows>[0];
  total: number;
}): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bothmade.studio';

  const rows = configurationRows(config)
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding:10px 0; color:rgba(255,255,255,0.45); font-size:14px; vertical-align:top; width:130px;">${escapeHtml(label)}</td>
          <td style="padding:10px 0; color:#ffffff; font-size:14px;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');

  const firstName = contactName.trim().split(/\s+/)[0] || 'there';

  const bodyHtml = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Thanks for putting a project together on our pricing page — here's a copy of exactly what you picked, so you have it in writing and don't have to rebuild it from memory.</p>
    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:8px 20px; margin:20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </div>
    <p style="font-size:13px; color:rgba(255,255,255,0.5);">
      That total is an estimate based on these selections, not an invoice — nothing is
      charged and nothing is locked in. Scope gets confirmed in Discovery before any
      money changes hands, and anything you add or drop is quoted as its own change
      order rather than absorbed silently.
    </p>
    <p>We'll follow up shortly. If you'd rather not wait, grab a time that suits you:</p>
  `;

  const sent = await sendEmail({
    to: email,
    subject: `Your ${BASE_SERVICES[config.baseService].label} configuration — ${formatCents(total)}`,
    replyTo: ADMIN_EMAIL,
    html: renderShell({
      eyebrow: 'Your configuration',
      title: `What you put together for ${escapeHtml(company)}`,
      bodyHtml,
      ctaLabel: BOOKING_LABEL,
      ctaUrl: BOOKING_URL,
      footerNote: `Change your mind about anything? Reconfigure at ${siteUrl}/start`,
    }),
  });

  if (!sent) {
    console.error('Buyer configuration recap failed to send:', email);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(clientKey(request))) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      baseService,
      addOns = [],
      clientType,
      timeline,
    } = body ?? {};

    // These three now outlive the request — they become a CRM row, a
    // reply-to address, and the recipient of the buyer's recap email — so
    // they get trimmed, bounded, and format-checked rather than passed
    // through on trust the way an email-only endpoint could get away with.
    const contactName = str(body?.contactName, LIMITS.name);
    const email = str(body?.email, LIMITS.email);
    const company = str(body?.company, LIMITS.company);
    const phone = str(body?.phone, LIMITS.phone);

    if (!contactName || !email || !company) {
      return NextResponse.json(
        { error: 'Name, email, and company are required' },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }
    if (!isBaseService(baseService) || !isClientType(clientType) || !isTimelineKey(timeline)) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
    }
    const addOnKeys: AddOnKey[] = Array.isArray(addOns) ? addOns.filter(isAddOnKey) : [];

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });

    const addOnRows = addOnKeys.map((key) => `<li>${escapeHtml(ADD_ONS[key].label)}</li>`).join('');

    const html = `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, sans-serif; color: #111;">
    <h2>New pricing calculator interest</h2>
    <p><strong>${escapeHtml(contactName)}</strong> at <strong>${escapeHtml(company)}</strong> configured a project and wants to talk before paying.</p>
    <table cellpadding="6" style="border-collapse: collapse;">
      <tr><td><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
      ${phone ? `<tr><td><strong>Phone</strong></td><td>${escapeHtml(phone)}</td></tr>` : ''}
      <tr><td><strong>Service</strong></td><td>${escapeHtml(BASE_SERVICES[baseService].label)}</td></tr>
      <tr><td><strong>Add-ons</strong></td><td>${addOnRows ? `<ul>${addOnRows}</ul>` : 'None'}</td></tr>
      <tr><td><strong>Client type</strong></td><td>${escapeHtml(CLIENT_TYPES[clientType].label)}</td></tr>
      <tr><td><strong>Timeline</strong></td><td>${escapeHtml(TIMELINES[timeline].label)} (${escapeHtml(TIMELINES[timeline].weeks)})</td></tr>
      <tr><td><strong>Estimated total</strong></td><td>${formatCents(breakdown.totalPrice)}</td></tr>
    </table>
  </body>
</html>`;

    // A row in the CRM, not just a message in an inbox. This used to be
    // email-only, which meant the warmest inbound lead on the site survived
    // exactly as long as somebody remembered to read that email.
    await recordInboundLead({
      contact: { email, company, contactName, phone },
      config: { baseService, addOns: addOnKeys, clientType, timeline },
      status: 'replied',
      source: 'inbound-pricing-form',
      note: 'Configured a project on the public /start calculator and asked to talk before paying.',
    });

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `Pricing interest: ${company} — ${BASE_SERVICES[baseService].label}`,
      html,
      replyTo: email,
    });

    // The buyer's own copy. They just spent real time assembling a spec and
    // then navigated away from it with nothing to show for it — this is the
    // artefact they can forward to a partner, sit on for a week, and come
    // back to, instead of rebuilding the whole configuration from memory.
    await sendBuyerRecap({
      email,
      contactName,
      company,
      config: { baseService, addOns: addOnKeys, clientType, timeline },
      total: breakdown.totalPrice,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Start interest error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
