import { NextRequest, NextResponse } from 'next/server';
import { suppress, verifyUnsubscribeToken } from '@/lib/compliance';
import { escapeHtml } from '@/lib/html';

/**
 * The opt-out endpoint every outbound email points at, in both the visible
 * footer link and the List-Unsubscribe headers.
 *
 * Deliberately has no login, no confirmation step, and no "are you sure".
 * CAN-SPAM requires the mechanism to work without the recipient creating an
 * account or providing anything beyond their email address and an opt-out
 * preference, and RFC 8058 one-click requires the POST to take effect
 * immediately with no further interaction. A token in the URL is the only
 * thing standing between a stranger and unsubscribing somebody else, which
 * is why it's an HMAC of the address rather than the address in plaintext.
 */

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} — Bothmade</title>
  </head>
  <body style="margin:0;background:#05030a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:96px 24px;">
      <p style="font-size:22px;font-weight:800;letter-spacing:-0.02em;margin:0 0 40px 0;">
        <span style="color:#7dd3fc;">both</span><span style="color:#fff;">made</span>
      </p>
      <h1 style="font-size:32px;line-height:1.15;margin:0 0 16px 0;">${escapeHtml(title)}</h1>
      <p style="color:rgba(255,255,255,0.55);line-height:1.7;margin:0;">${body}</p>
    </div>
  </body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function optOut(token: string | null): Promise<{ ok: boolean; email?: string }> {
  if (!token) return { ok: false };
  const email = verifyUnsubscribeToken(token);
  if (!email) return { ok: false };
  await suppress(email, 'unsubscribe', 'email footer / list-unsubscribe');
  return { ok: true, email };
}

/** RFC 8058 one-click: the mail client POSTs here with no human involved. */
export async function POST(request: NextRequest) {
  const token =
    new URL(request.url).searchParams.get('token') ??
    (await request.formData().catch(() => null))?.get('token')?.toString() ??
    null;

  const { ok } = await optOut(token);
  return NextResponse.json({ success: ok }, { status: ok ? 200 : 400 });
}

/** The visible footer link — a human clicking through gets a page. */
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('token');
  const { ok, email } = await optOut(token);

  if (!ok) {
    return page(
      "That link didn't work",
      "This unsubscribe link is invalid or incomplete. Reply to any email from us with the word <strong style=\"color:#fff\">unsubscribe</strong> and we'll take you off the list by hand — same day.",
      400
    );
  }

  return page(
    "You're unsubscribed",
    `We won't email <strong style="color:#fff">${escapeHtml(
      email!
    )}</strong> again. Nothing else is required from you.<br /><br />If somebody here is mid-project with us, replies to that conversation still reach us normally — this only stops us starting new ones.`
  );
}
