import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, studioInbox } from '@/lib/email';
import { prisma } from '@/lib/prisma';
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

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(clientKey(request))) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const {
      contactName,
      email,
      company,
      phone,
      baseService,
      addOns = [],
      clientType,
      timeline,
    } = await request.json();

    if (!contactName || !email || !company) {
      return NextResponse.json(
        { error: 'Name, email, and company are required' },
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

    // Same reasoning as /api/contact: the lead row is the record, the email is
    // the notification. Someone who priced a project and asked to talk is the
    // warmest inbound there is — it does not belong only in an inbox.
    try {
      const existing = await prisma.lead.findFirst({
        where: { email },
        select: { id: true },
      });

      const summary = [
        `Configured on the pricing calculator: ${BASE_SERVICES[baseService].label}`,
        `Add-ons: ${addOnKeys.map((key) => ADD_ONS[key].label).join(', ') || 'None'}`,
        `Client type: ${CLIENT_TYPES[clientType].label}`,
        `Timeline: ${TIMELINES[timeline].label} (${TIMELINES[timeline].weeks})`,
        `Estimated total: ${formatCents(breakdown.totalPrice)}`,
      ].join('\n');

      if (existing) {
        await prisma.leadActivity.create({
          data: { leadId: existing.id, type: 'note', content: summary },
        });
        await prisma.lead.update({
          where: { id: existing.id },
          data: { replyReceivedAt: new Date() },
        });
      } else {
        await prisma.lead.create({
          data: {
            company,
            contactName,
            email,
            phone: phone || null,
            status: 'new',
            source: 'inbound-pricing',
            estimatedValue: breakdown.totalPrice,
            notes: summary,
          },
        });
      }
    } catch (error) {
      console.error('Failed to record pricing interest as a lead:', error);
    }

    await sendEmail({
      to: studioInbox(),
      subject: `Pricing interest: ${company} — ${BASE_SERVICES[baseService].label}`,
      html,
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
