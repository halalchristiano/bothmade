import { NextRequest, NextResponse } from 'next/server';
import {
  CARE_PLANS,
  CLIENT_TYPES,
  PROJECTS,
  TIMELINES,
  estimate,
  estimateToLines,
  formatMoney,
  pruneAddOns,
  type CarePlanId,
  type ClientTypeId,
  type ProjectId,
  type Selection,
  type TimelineId,
} from '@/lib/pricing';
import {
  DEFAULT_TTL_MS,
  PHASES,
  mintToken,
  portalConfigured,
  type PhaseId,
  type PortalClient,
} from '@/lib/portal';
import {
  cleanText,
  emailShell,
  escapeHtml,
  getResend,
  isAdmin,
  isValidEmail,
  mailFrom,
  studioInbox,
} from '@/lib/server';

/**
 * Studio-only. Turns an agreed deal into a client portal link and emails it.
 *
 * This is the one manual step in the whole flow, and deliberately so: a link
 * is minted when a human has decided this person is a client, not when a form
 * is submitted. Everything after it is self-serve.
 *
 *   curl -X POST https://bothmade.studio/api/portal/invite \
 *     -H "x-admin-secret: $ADMIN_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"name":"Ada","email":"ada@example.com","project":"both",
 *          "client":"funded","addOns":{"cms":1},"send":true}'
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const ids = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id));
const PROJECT_IDS = ids(PROJECTS);
const CLIENT_IDS = ids(CLIENT_TYPES);
const TIMELINE_IDS = ids(TIMELINES);
const CARE_IDS = ids(CARE_PLANS);
const PHASE_IDS = ids(PHASES);

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) {
    // Deliberately identical to a wrong path — an unauthenticated caller
    // should not learn that this endpoint exists.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!portalConfigured()) {
    return NextResponse.json(
      { error: 'PORTAL_SECRET is not set (needs at least 32 characters).' },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = cleanText(body.name, 100);
  const email = cleanText(body.email, 254);
  const company = cleanText(body.company, 120);

  if (!name || !isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid name and email are required.' }, { status: 400 });
  }

  const project = typeof body.project === 'string' && PROJECT_IDS.has(body.project)
    ? (body.project as ProjectId)
    : null;
  const clientType = typeof body.client === 'string' && CLIENT_IDS.has(body.client)
    ? (body.client as ClientTypeId)
    : null;

  if (!project || !clientType) {
    return NextResponse.json(
      { error: `project must be one of ${[...PROJECT_IDS].join(', ')}; client one of ${[...CLIENT_IDS].join(', ')}` },
      { status: 400 }
    );
  }

  const timeline = typeof body.timeline === 'string' && TIMELINE_IDS.has(body.timeline)
    ? (body.timeline as TimelineId)
    : 'standard';
  const care = typeof body.care === 'string' && CARE_IDS.has(body.care)
    ? (body.care as CarePlanId)
    : 'none';
  const phase = typeof body.phase === 'string' && PHASE_IDS.has(body.phase)
    ? (body.phase as PhaseId)
    : 'onboarding';

  const rawAddOns =
    typeof body.addOns === 'object' && body.addOns !== null
      ? (body.addOns as Record<string, unknown>)
      : {};

  const addOns: Record<string, number> = {};
  for (const [id, value] of Object.entries(rawAddOns)) {
    const qty = Math.floor(Number(value));
    if (Number.isFinite(qty) && qty > 0) addOns[id] = qty;
  }

  const selection: Selection = {
    project,
    client: clientType,
    addOns: pruneAddOns(addOns, project, clientType),
    timeline,
    care,
  };

  const depositPercent = Math.min(
    100,
    Math.max(10, Math.floor(Number(body.depositPercent)) || defaultDeposit(estimate(selection).total))
  );

  const portalClient: PortalClient = {
    v: 1,
    name,
    email,
    company: company || undefined,
    selection,
    phase,
    depositPercent,
    iat: Date.now(),
    exp: Date.now() + DEFAULT_TTL_MS,
  };

  const token = mintToken(portalClient);
  if (!token) {
    return NextResponse.json({ error: 'Portal not configured.' }, { status: 500 });
  }

  const url = `${SITE_URL}/client/${token}`;
  const est = estimate(selection);
  const deposit = Math.round((est.total * depositPercent) / 100);

  // Emailing the link is opt-in, so a link can be minted and checked before
  // it lands in a client's inbox.
  if (body.send === true) {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY not configured — link created but not sent.', url },
        { status: 502 }
      );
    }

    const sent = await getResend().emails.send({
      from: mailFrom(),
      to: email,
      replyTo: studioInbox(),
      subject: 'Your Bothmade project — everything in one place',
      html: emailShell(
        `<h2 style="color:#000;">Welcome aboard, ${escapeHtml(name)}</h2>
         <p style="color:#666;line-height:1.6;">
           Everything for your project lives at one private link — what you're getting,
           the onboarding questions we need answered, the deposit, and where the build
           has got to. Bookmark it; it stays up to date the whole way through.
         </p>
         <p style="margin:28px 0;">
           <a href="${url}" style="background:#000;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Open your project</a>
         </p>
         <p style="color:#999;font-size:13px;line-height:1.6;">
           This link is personal to you — treat it like a password, and don't forward it.
           It expires in six months.
         </p>
         <table style="width:100%;border-collapse:collapse;margin-top:24px;">
           ${estimateToLines(est)
             .map(
               (line) =>
                 `<tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;color:#444;font-size:14px;">${escapeHtml(line)}</td></tr>`
             )
             .join('')}
         </table>
         <p style="color:#666;line-height:1.6;margin-top:20px;">
           <strong>To start:</strong> ${formatMoney(deposit)} deposit (${depositPercent}%), payable on the page above.
         </p>`
      ),
    });

    if (sent.error) {
      console.error('Portal invite failed to send:', sent.error);
      return NextResponse.json({ error: 'Link created but email failed.', url }, { status: 502 });
    }
  }

  return NextResponse.json({
    url,
    total: est.total,
    deposit,
    depositPercent,
    monthly: est.monthly?.amount ?? 0,
    expires: new Date(portalClient.exp).toISOString(),
    emailed: body.send === true,
  });
}

/** Big builds get milestoned rather than half-paid up front. */
function defaultDeposit(total: number): number {
  return total >= 15000 ? 40 : 50;
}
