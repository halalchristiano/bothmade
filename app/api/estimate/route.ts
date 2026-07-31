import { NextRequest, NextResponse } from 'next/server';
import {
  CARE_PLANS,
  CLIENT_TYPES,
  PROJECTS,
  TIMELINES,
  estimate,
  estimateToLines,
  formatMoney,
  getCarePlan,
  getClientType,
  getProject,
  getTimeline,
  pruneAddOns,
  visibleGroups,
  type CarePlanId,
  type ClientTypeId,
  type ProjectId,
  type Selection,
  type TimelineId,
} from '@/lib/pricing';
import {
  cleanText,
  clientKey,
  getResend,
  createRateLimiter,
  emailShell,
  escapeHtml,
  isValidEmail,
} from '@/lib/server';

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'contact@bothmade.com';

const LIMITS = {
  name: 100,
  email: 254,
  company: 120,
  notes: 4000,
} as const;

// Filling this in takes minutes, so the window is tighter than the contact
// form's per-message allowance would suggest.
const isRateLimited = createRateLimiter({ max: 5, windowMs: 10 * 60 * 1000 });

const ids = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id));

const PROJECT_IDS = ids(PROJECTS);
const CLIENT_IDS = ids(CLIENT_TYPES);
const TIMELINE_IDS = ids(TIMELINES);
const CARE_IDS = ids(CARE_PLANS);

/**
 * Rebuild the selection from raw JSON, keeping only what the catalogue
 * recognises. The browser sends its own total too, but we never read it — the
 * number we quote is the number this server computed, or there is no point
 * having published prices at all.
 */
function parseSelection(raw: unknown): Selection | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const body = raw as Record<string, unknown>;

  const project = typeof body.project === 'string' && PROJECT_IDS.has(body.project)
    ? (body.project as ProjectId)
    : null;
  const client = typeof body.client === 'string' && CLIENT_IDS.has(body.client)
    ? (body.client as ClientTypeId)
    : null;

  if (!project || !client) return null;

  const timeline = typeof body.timeline === 'string' && TIMELINE_IDS.has(body.timeline)
    ? (body.timeline as TimelineId)
    : 'standard';
  const care = typeof body.care === 'string' && CARE_IDS.has(body.care)
    ? (body.care as CarePlanId)
    : 'none';

  // Quantities arrive as numbers but could be anything; clamp each to the
  // catalogue's own maximum so a hand-crafted request can't invoice itself
  // for ten thousand extra pages.
  const caps = new Map(
    visibleGroups(project, client)
      .flatMap((g) => g.items)
      .map((i) => [i.id, i.unit?.max ?? 1] as const)
  );

  const rawAddOns =
    typeof body.addOns === 'object' && body.addOns !== null
      ? (body.addOns as Record<string, unknown>)
      : {};

  const addOns: Record<string, number> = {};
  for (const [id, value] of Object.entries(rawAddOns)) {
    const cap = caps.get(id);
    if (cap === undefined) continue;

    const qty = Math.floor(Number(value));
    if (!Number.isFinite(qty) || qty <= 0) continue;

    addOns[id] = Math.min(qty, cap);
  }

  return {
    project,
    client,
    addOns: pruneAddOns(addOns, project, client),
    timeline,
    care,
  };
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(clientKey(request))) {
      return NextResponse.json(
        { error: 'Too many briefs from this connection. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { name, email, company, notes, website } = body ?? {};

    // Honeypot: a real person never fills a field they cannot see. Respond 200
    // so bots get no signal that they were caught.
    if (typeof website === 'string' && website.trim() !== '') {
      return NextResponse.json({ message: 'Brief received.' }, { status: 200 });
    }

    const cleanName = cleanText(name, LIMITS.name);
    const cleanEmail = cleanText(email, LIMITS.email);
    const cleanCompany = cleanText(company, LIMITS.company);
    const cleanNotes = cleanText(notes, LIMITS.notes);

    if (!cleanName || !cleanEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const selection = parseSelection(body);
    if (!selection) {
      return NextResponse.json(
        { error: 'Choose what you want built and who you are before sending.' },
        { status: 400 }
      );
    }

    const est = estimate(selection);

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const project = getProject(selection.project);
    const clientType = getClientType(selection.client);
    const timeline = getTimeline(selection.timeline);
    const care = getCarePlan(selection.care);

    const safe = {
      name: escapeHtml(cleanName),
      email: escapeHtml(cleanEmail),
      company: escapeHtml(cleanCompany || 'Not provided'),
      notes: escapeHtml(cleanNotes || 'Nothing added.'),
    };

    // The breakdown is generated from the catalogue, never from user input, so
    // it needs no escaping — but it goes through the same helper anyway rather
    // than relying on that staying true.
    const breakdownRows = estimateToLines(est)
      .map(
        (line) =>
          `<tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;color:#444;font-size:14px;">${escapeHtml(line)}</td></tr>`
      )
      .join('');

    const adminEmail = await getResend().emails.send({
      from: CONTACT_EMAIL,
      to: CONTACT_EMAIL,
      replyTo: cleanEmail,
      subject: `New brief — ${cleanName}, ${project?.name} (${formatMoney(est.total)})`,
      html: emailShell(
        `<h2 style="color:#000;">New project brief</h2>
         <p style="font-size:28px;font-weight:700;color:#000;margin:8px 0 24px;">${formatMoney(est.total)}${
           est.monthly ? ` <span style="font-size:15px;font-weight:400;color:#666;">+ ${formatMoney(est.monthly.amount)}/mo</span>` : ''
         }</p>
         <p><strong>Name:</strong> ${safe.name}</p>
         <p><strong>Email:</strong> ${safe.email}</p>
         <p><strong>Company:</strong> ${safe.company}</p>
         <p><strong>Building:</strong> ${escapeHtml(project?.name ?? '—')}</p>
         <p><strong>Client type:</strong> ${escapeHtml(clientType?.name ?? '—')}</p>
         <p><strong>Timeline:</strong> ${escapeHtml(timeline.name)}</p>
         <p><strong>Care plan:</strong> ${escapeHtml(care.name)}</p>
         <h3 style="color:#000;margin-top:24px;">Breakdown</h3>
         <table style="width:100%;border-collapse:collapse;">${breakdownRows}</table>
         <h3 style="color:#000;margin-top:24px;">Their notes</h3>
         <p style="color:#666;white-space:pre-wrap;line-height:1.6;">${safe.notes}</p>`
      ),
    });

    if (adminEmail.error) {
      console.error('Brief notification failed:', adminEmail.error);
      return NextResponse.json({ error: 'Failed to send your brief.' }, { status: 502 });
    }

    // Their copy of the estimate. Best-effort: if it bounces, the brief still
    // reached the studio, so don't fail the request over it.
    const ackEmail = await getResend().emails.send({
      from: CONTACT_EMAIL,
      to: cleanEmail,
      subject: `Your Bothmade estimate — ${formatMoney(est.total)}`,
      html: emailShell(
        `<h2 style="color:#000;">Here's your estimate</h2>
         <p style="color:#666;line-height:1.6;">Hi ${safe.name}, this is the same breakdown you just built, so you have it in writing.</p>
         <p style="font-size:28px;font-weight:700;color:#000;margin:20px 0;">${formatMoney(est.total)}${
           est.monthly ? ` <span style="font-size:15px;font-weight:400;color:#666;">+ ${formatMoney(est.monthly.amount)}/mo</span>` : ''
         }</p>
         <table style="width:100%;border-collapse:collapse;">${breakdownRows}</table>
         <p style="color:#666;line-height:1.6;margin-top:24px;">
           This is an estimate, not an invoice. We'll confirm the scope on a call
           and tell you plainly if anything here is priced wrong for what you
           actually need — in either direction. We'll be in touch within 24 hours.
         </p>`
      ),
    });

    if (ackEmail.error) {
      console.error('Estimate acknowledgement failed:', ackEmail.error);
    }

    return NextResponse.json(
      { message: "Brief received. We'll be in touch within 24 hours." },
      { status: 200 }
    );
  } catch (error) {
    console.error('Estimate form error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
