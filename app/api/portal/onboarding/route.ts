import { NextRequest, NextResponse } from 'next/server';
import { estimate, formatMoney, getProject } from '@/lib/pricing';
import { readToken } from '@/lib/portal';
import { allowedFieldIds, sectionsFor } from '@/lib/onboarding';
import {
  clientKey,
  createRateLimiter,
  emailShell,
  escapeHtml,
  getResend,
  isValidEmail,
  mailFrom,
  studioInbox,
} from '@/lib/server';

/**
 * Receives a client's onboarding answers.
 *
 * The answers are emailed rather than stored. That is a deliberate choice for
 * this stage, not an oversight: a database would need provisioning, migrating,
 * backing up, and — since this form collects business detail and account
 * ownership — securing and deleting on request. An email to the studio plus a
 * copy to the client gets the information where it needs to go, leaves the
 * client holding their own record, and adds no infrastructure to run.
 *
 * When the studio has enough clients that a searchable archive beats a mail
 * folder, swap the two `send` calls for a write. The validation above them is
 * already the hard part and does not change.
 */

const ANSWER_MAX = 4000;
const isRateLimited = createRateLimiter({ max: 6, windowMs: 30 * 60 * 1000 });

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(clientKey(request))) {
      return NextResponse.json({ error: 'Too many submissions. Try again shortly.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const { token, answers } = body as { token?: unknown; answers?: unknown };

    if (typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing access token.' }, { status: 401 });
    }

    // The token is the authorisation. Anyone can POST here, but only a holder
    // of a signed link can get a submission accepted — and the identity it
    // gets filed under comes from the token, never from the request body.
    const result = readToken(token);
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.reason === 'expired'
              ? 'This link has expired. Ask us for a fresh one.'
              : 'This link is not valid.',
        },
        { status: 401 }
      );
    }

    const client = result.client;

    if (typeof answers !== 'object' || answers === null) {
      return NextResponse.json({ error: 'No answers submitted.' }, { status: 400 });
    }

    // Only questions that exist for this client's build are accepted, so a
    // crafted request can't inject arbitrary content into the studio's inbox.
    const allowed = allowedFieldIds(client.selection.project);
    const clean: Record<string, string> = {};

    for (const [id, value] of Object.entries(answers as Record<string, unknown>)) {
      if (!allowed.has(id)) continue;

      const text = Array.isArray(value)
        ? value.filter((v) => typeof v === 'string').join(', ')
        : typeof value === 'string'
          ? value
          : '';

      const trimmed = text.trim().slice(0, ANSWER_MAX);
      if (trimmed) clean[id] = trimmed;
    }

    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: 'Nothing was filled in.' }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const project = getProject(client.selection.project);
    const est = estimate(client.selection);
    const sections = sectionsFor(client.selection.project);

    // Rendered in the order the client saw them, with the question text
    // included — a bare answer six weeks later is a puzzle.
    const rendered = sections
      .map((section) => {
        const rows = section.fields
          .filter((f) => clean[f.id])
          .map(
            (f) =>
              `<tr><td style="padding:14px 0;border-bottom:1px solid #f0f0f0;">
                 <p style="margin:0 0 6px;font-size:13px;color:#888;">${escapeHtml(f.label)}</p>
                 <p style="margin:0;font-size:15px;color:#111;white-space:pre-wrap;line-height:1.55;">${escapeHtml(clean[f.id])}</p>
               </td></tr>`
          )
          .join('');

        if (!rows) return '';
        return `<h3 style="color:#000;margin:30px 0 6px;">${escapeHtml(section.title)}</h3>
                <table style="width:100%;border-collapse:collapse;">${rows}</table>`;
      })
      .join('');

    const answered = Object.keys(clean).length;
    const total = sections.reduce((n, s) => n + s.fields.length, 0);

    const safeName = escapeHtml(client.name);
    const safeCompany = escapeHtml(client.company ?? '—');

    const adminEmail = await getResend().emails.send({
      from: mailFrom(),
      to: studioInbox(),
      replyTo: client.email,
      subject: `Onboarding complete — ${client.name} (${answered}/${total} answered)`,
      html: emailShell(
        `<h2 style="color:#000;">Onboarding answers</h2>
         <p><strong>Client:</strong> ${safeName} · ${escapeHtml(client.email)}</p>
         <p><strong>Company:</strong> ${safeCompany}</p>
         <p><strong>Building:</strong> ${escapeHtml(project?.name ?? '—')} · ${formatMoney(est.total)}</p>
         <p style="color:#888;font-size:13px;">${answered} of ${total} questions answered.</p>
         ${rendered}`
      ),
    });

    if (adminEmail.error) {
      console.error('Onboarding notification failed:', adminEmail.error);
      return NextResponse.json({ error: 'Could not submit your answers.' }, { status: 502 });
    }

    // Their own copy. Best-effort — the studio already has the answers.
    if (isValidEmail(client.email)) {
      const ack = await getResend().emails.send({
        from: mailFrom(),
        to: client.email,
        replyTo: studioInbox(),
        subject: 'Your onboarding answers — a copy for your records',
        html: emailShell(
          `<h2 style="color:#000;">Thanks, ${safeName} — got everything</h2>
           <p style="color:#666;line-height:1.6;">
             Here is a copy of what you sent us, so you have it. If you want to change
             any of it, just reply to this email — nothing here is set in stone, and it
             is much cheaper to correct now than in week six.
           </p>
           <p style="color:#666;line-height:1.6;">
             We are reading through it properly and will come back within two working
             days with anything that needs a conversation.
           </p>
           ${rendered}`
        ),
      });

      if (ack.error) console.error('Onboarding acknowledgement failed:', ack.error);
    }

    return NextResponse.json({ message: 'Answers received.', answered, total }, { status: 200 });
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
