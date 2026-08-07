import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveSiteUrl } from '@/lib/site-url';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';

/**
 * Stop emailing this lead. POST only, deliberately.
 *
 * The unsubscribe used to happen while rendering the page the email links to,
 * which meant anything that FETCHED the link performed it. Corporate mail
 * security — Proofpoint, Mimecast, Barracuda — follows every link in every
 * message to check where it goes, and the daily enquiry nudge carries this
 * link to inbound leads, who are the warmest contacts in the system. A
 * scanner opening one silently marked the lead do-not-contact, the sequence
 * stopped, and nobody found out: it looks identical to a prospect who wanted
 * out. The same class of automated fetch that inflates the open pixel.
 *
 * A GET must not change anything. So the page now shows a button and this
 * route does the work — one extra click for a person, and unreachable for a
 * link-follower, which is the only test that actually separates them.
 *
 * Still no login and no "tell us why". Somebody who has asked to be left
 * alone should not be made to justify it.
 */
export async function POST(request: NextRequest) {
  const site = resolveSiteUrl();
  let token = '';

  try {
    const form = await request.formData();
    token = String(form.get('token') || '');
  } catch {
    // A JSON caller is fine too — the form post is just what the page uses.
    try {
      const body = (await request.json()) as { token?: string };
      token = String(body?.token || '');
    } catch {
      token = '';
    }
  }

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  /*
   * Generous, because the failure mode here is unusual.
   *
   * Unsubscribing is idempotent and the endpoint is the least attractive
   * target in the app — the most anyone gains is stopping mail we did not
   * want to send anyway. What this actually guards is a token-guessing sweep:
   * a `shareToken` is the same capability the proposal and brief links use,
   * so somewhere to try thousands of them and learn from the answer which
   * ones exist is worth closing even when the action itself is harmless.
   *
   * Deliberately after the missing-token check and before the lookup, so a
   * caller cannot spend the budget probing without at least supplying one.
   */
  const limited = await enforceRateLimit(
    request,
    'unsubscribe',
    RATE_LIMITS.publicWrite,
    'Too many attempts. Please wait a moment and try again.'
  );
  if (limited) return limited;

  const lead = await prisma.lead
    .findUnique({ where: { shareToken: token }, select: { id: true, doNotContact: true } })
    .catch(() => null);

  // Idempotent: unsubscribing twice is not an error, and telling somebody
  // their second attempt failed would be the worst possible moment to do it.
  if (lead && !lead.doNotContact) {
    await prisma.lead
      .update({
        where: { id: lead.id },
        data: { doNotContact: true, doNotContactReason: 'Unsubscribed from a follow-up email.' },
      })
      .catch((e) => console.error('Unsubscribe not recorded:', e));

    // On the timeline rather than only in a column, so a rep who wonders why
    // this lead went quiet sees the answer in the same place as everything
    // else that happened to them.
    await prisma.leadActivity
      .create({
        data: {
          leadId: lead.id,
          type: 'note',
          content: 'Unsubscribed from follow-up emails. Do not contact by email.',
        },
      })
      .catch((e) => console.error('Unsubscribe activity not written:', e));
  }

  // 303 so the browser follows with a GET and a refresh cannot re-post.
  return NextResponse.redirect(`${site}/stop/${encodeURIComponent(token)}?done=1`, 303);
}
