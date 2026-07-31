import { NextRequest, NextResponse } from 'next/server';
import { readToken } from '@/lib/portal';
import { createDepositSession } from '@/lib/stripe';
import { clientKey, createRateLimiter } from '@/lib/server';

/** Starts a Stripe Checkout session for the deposit. */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const isRateLimited = createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 });

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(clientKey(request))) {
      return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
    }

    const { token } = (await request.json().catch(() => ({}))) as { token?: unknown };

    if (typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing access token.' }, { status: 401 });
    }

    // The token is the authorisation, and the amount comes from inside it —
    // the browser never proposes a price.
    const result = readToken(token);
    if (!result.ok) {
      return NextResponse.json({ error: 'This link is not valid.' }, { status: 401 });
    }

    const session = await createDepositSession(result.client, token, SITE_URL);

    if (!session.ok) {
      // "Card payments aren't switched on" is not a failure the client should
      // see as one — an invoice still works, and the portal says so.
      if (session.reason === 'unconfigured') {
        return NextResponse.json({ unavailable: true }, { status: 200 });
      }
      return NextResponse.json({ error: 'Could not start checkout.' }, { status: 502 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
