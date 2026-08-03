import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
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
    const limited = await enforceRateLimit(
      request,
      'interest',
      RATE_LIMITS.interest,
      'Too many requests. Please try again later.'
    );
    if (limited) return limited;

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

    await sendEmail({
      to: ADMIN_EMAIL,
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
