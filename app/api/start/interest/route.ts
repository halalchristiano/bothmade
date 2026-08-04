import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, studioInbox } from '@/lib/email';
import { escapeHtml } from '@/lib/html';
import { findSalesRep, notifyRepInboundEnquiry, type SalesRep } from '@/lib/notify';
import { prisma } from '@/lib/prisma';
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
import {
  FIELD_ERRORS,
  FIELD_LIMITS,
  isValidCompany,
  isValidEmail,
  isValidName,
  isValidPhone,
  normalizePhone,
} from '@/lib/validation';

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

    if (
      typeof contactName !== 'string' ||
      typeof email !== 'string' ||
      typeof company !== 'string' ||
      !contactName.trim() ||
      !email.trim() ||
      !company.trim()
    ) {
      return NextResponse.json(
        { error: 'Name, email, and company are required' },
        { status: 400 }
      );
    }

    const cleanName = contactName.trim().slice(0, FIELD_LIMITS.name);
    const cleanEmail = email.trim().slice(0, FIELD_LIMITS.email);
    const cleanCompany = company.trim().slice(0, FIELD_LIMITS.company);
    const rawPhone = typeof phone === 'string' ? phone.trim().slice(0, FIELD_LIMITS.phone) : '';

    // The same predicates /api/contact runs. Both routes write to the same
    // Lead row from the same site, so a rule enforced on one door and not the
    // other just means what the CRM holds depends on which door a lead came
    // through — and a rep finds out on the call that fails.
    //
    // Phone stays optional: someone who has configured a whole project is not
    // worth losing over a number. But a number that *is* given has to dial.
    const invalid = (
      [
        [!isValidName(cleanName), FIELD_ERRORS.name],
        [!isValidEmail(cleanEmail), FIELD_ERRORS.email],
        [Boolean(rawPhone) && !isValidPhone(rawPhone), FIELD_ERRORS.phone],
        [!isValidCompany(cleanCompany), FIELD_ERRORS.company],
      ] as [boolean, string][]
    ).find(([failed]) => failed);

    if (invalid) {
      return NextResponse.json({ error: invalid[1] }, { status: 400 });
    }

    const cleanPhone = rawPhone ? normalizePhone(rawPhone) : '';

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
    <p><strong>${escapeHtml(cleanName)}</strong> at <strong>${escapeHtml(cleanCompany)}</strong> configured a project and wants to talk before paying.</p>
    <table cellpadding="6" style="border-collapse: collapse;">
      <tr><td><strong>Email</strong></td><td>${escapeHtml(cleanEmail)}</td></tr>
      ${cleanPhone ? `<tr><td><strong>Phone</strong></td><td>${escapeHtml(cleanPhone)}</td></tr>` : ''}
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
    let leadId: string | null = null;
    let returning = false;
    let rep: SalesRep | null = null;

    const summary = [
      `Configured on the pricing calculator: ${BASE_SERVICES[baseService].label}`,
      `Add-ons: ${addOnKeys.map((key) => ADD_ONS[key].label).join(', ') || 'None'}`,
      `Client type: ${CLIENT_TYPES[clientType].label}`,
      `Timeline: ${TIMELINES[timeline].label} (${TIMELINES[timeline].weeks})`,
      `Estimated total: ${formatCents(breakdown.totalPrice)}`,
    ].join('\n');

    try {
      rep = await findSalesRep();

      const existing = await prisma.lead.findFirst({
        where: { email: cleanEmail },
        select: { id: true },
      });

      if (existing) {
        await prisma.leadActivity.create({
          data: { leadId: existing.id, type: 'note', content: summary },
        });
        await prisma.lead.update({
          where: { id: existing.id },
          data: { replyReceivedAt: new Date() },
        });
        leadId = existing.id;
        returning = true;
      } else {
        const lead = await prisma.lead.create({
          data: {
            company: cleanCompany,
            contactName: cleanName,
            email: cleanEmail,
            phone: cleanPhone || null,
            status: 'new',
            source: 'inbound-pricing',
            estimatedValue: breakdown.totalPrice,
            notes: summary,
            // Same as the contact form: unassigned inbound never reaches the
            // call list or the follow-up digest, both of which are per-rep.
            assignedToId: rep.id,
          },
          select: { id: true },
        });
        leadId = lead.id;
      }
    } catch (error) {
      console.error('Failed to record pricing interest as a lead:', error);
    }

    await sendEmail({
      to: studioInbox(),
      subject: `Pricing interest: ${cleanCompany} — ${BASE_SERVICES[baseService].label}`,
      html,
    });

    // Evan specifically — the lead is his, and this one arrives with a budget
    // already attached, so it is the most actionable mail the studio gets.
    if (leadId && rep) {
      const sent = await notifyRepInboundEnquiry({
        toEmail: rep.email,
        repName: rep.name,
        leadId,
        contactName: cleanName,
        company: cleanCompany,
        email: cleanEmail,
        phone: cleanPhone,
        serviceLabel: `${BASE_SERVICES[baseService].label} — ${formatCents(breakdown.totalPrice)}`,
        message: summary,
        returning,
        via: 'the pricing calculator',
      });
      if (!sent) {
        console.error(`Sales alert to ${rep.email} failed for lead ${leadId}`);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Start interest error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
