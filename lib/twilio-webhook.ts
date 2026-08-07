import { NextRequest } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import { twilioConfig, verifyTwilioSignature } from '@/lib/twilio';

/**
 * The door every Twilio webhook comes through, checked once and in one place.
 *
 * These endpoints are public by necessity — a carrier has to be able to reach
 * them — and one of them answers with an instruction to dial a number. An
 * unverified version could be made to ring any number on earth at our
 * expense, which is the entire reason toll fraud is a category. So the check
 * lives here rather than being written out three times with two of them
 * subtly different.
 *
 * ## The URL has to match exactly
 *
 * The signature covers the URL Twilio requested, and behind a proxy
 * `request.url` is the internal one — a different host, sometimes a different
 * scheme — so verifying against it fails for every legitimate request. The
 * site URL is the address we told Twilio to call, so it is the one to rebuild
 * from, with the query string kept because Twilio signed that too.
 */
export interface TwilioWebhook {
  params: Record<string, string>;
  /** Set when the request is not from Twilio, or cannot be checked. */
  rejected?: { reason: string; status: number };
}

export async function readTwilioWebhook(request: NextRequest): Promise<TwilioWebhook> {
  const config = twilioConfig();
  if (!config) {
    // Nothing should be reaching these endpoints on a deployment with no
    // Twilio account, and without the auth token nothing can be verified —
    // so the only safe answer is no.
    return { params: {}, rejected: { reason: 'Twilio is not configured here.', status: 404 } };
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return { params: {}, rejected: { reason: 'Expected a form body.', status: 400 } };
  }

  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') params[key] = value;
  }

  const requested = new URL(request.url);
  const signedUrl = `${resolveSiteUrl().replace(/\/$/, '')}${requested.pathname}${requested.search}`;

  const ok = verifyTwilioSignature(
    signedUrl,
    params,
    request.headers.get('x-twilio-signature'),
    config.authToken
  );

  if (!ok) {
    console.error('[twilio] Refused a webhook whose signature did not match.');
    return { params, rejected: { reason: 'Signature did not match.', status: 403 } };
  }

  return { params };
}

/** TwiML, with the content type carriers actually require. */
export function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

/**
 * Anything user-supplied that lands inside TwiML has to be escaped, same as
 * HTML. A phone number should never contain a bracket — and "should never" is
 * how injection gets in.
 */
export function escXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
