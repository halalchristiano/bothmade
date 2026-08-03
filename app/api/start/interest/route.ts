import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { esc } from '@/lib/html';
import { enforce, limiterKey } from '@/lib/rate-limit';
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

// Shared limiter and escaping — see lib/rate-limit.ts and lib/html.ts.
// This route previously duplicated both.
const INTEREST_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 };

export async function POST(request: NextRequest) {
  try {
    const limited = await enforce([
      { key: limiterKey('start-interest', request), options: INTEREST_LIMIT, message: 'Too many requests. Please try again later.' },
    ]);
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

    const addOnRows = addOnKeys.map((key) => `<li>${esc(ADD_ONS[key].label)}</li>`).join('');

    const html = `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, sans-serif; color: #111;">
    <h2>New pricing calculator interest</h2>
    <p><strong>${esc(contactName)}</strong> at <strong>${esc(company)}</strong> configured a project and wants to talk before paying.</p>
    <table cellpadding="6" style="border-collapse: collapse;">
      <tr><td><strong>Email</strong></td><td>${esc(email)}</td></tr>
      ${phone ? `<tr><td><strong>Phone</strong></td><td>${esc(phone)}</td></tr>` : ''}
      <tr><td><strong>Service</strong></td><td>${esc(BASE_SERVICES[baseService].label)}</td></tr>
      <tr><td><strong>Add-ons</strong></td><td>${addOnRows ? `<ul>${addOnRows}</ul>` : 'None'}</td></tr>
      <tr><td><strong>Client type</strong></td><td>${esc(CLIENT_TYPES[clientType].label)}</td></tr>
      <tr><td><strong>Timeline</strong></td><td>${esc(TIMELINES[timeline].label)} (${esc(TIMELINES[timeline].weeks)})</td></tr>
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
