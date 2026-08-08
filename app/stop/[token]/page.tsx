import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { COMPANY_EMAIL, COMPANY_NAME } from '@/lib/company';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
};

/**
 * One click and we stop — but the click has to be a person's.
 *
 * This page used to mark the lead do-not-contact while rendering, so the
 * unsubscribe happened to anything that merely FETCHED the URL. Corporate
 * mail security follows every link in every message to see where it goes, and
 * the daily enquiry nudge puts this link in front of inbound leads — the
 * warmest contacts in the system. A scanner opening one killed the lead
 * silently: the sequence stopped, and it looked exactly like somebody asking
 * to be left alone. Nobody would ever have found out.
 *
 * So the page asks, and the button posts. That is one more click than before
 * and it is the only thing that actually distinguishes a person from a
 * link-follower — a GET must not change anything. Still no login, no form, no
 * "tell us why": somebody who has asked to be left alone should not have to
 * justify it.
 *
 * The token is the lead's own `shareToken`. Unguessable, identifies nobody
 * from the outside, and the worst a stranger holding one can do is stop us
 * emailing somebody — which is what the page is for.
 */
export default async function StopPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;

  const lead = await prisma.lead
    .findUnique({ where: { shareToken: token }, select: { company: true, doNotContact: true } })
    .catch(() => null);

  /*
   * What the record says, not what the URL says.
   *
   * This was `lead.doNotContact || done === '1'`, and that `||` only ever
   * changes the answer in one case: the column is false. Which is precisely
   * the case where we have not stopped. So the parameter existed to assert
   * the outcome exactly when the outcome had not happened — the page read the
   * truth, had it in hand, and preferred the query string. Anyone could also
   * open ?done=1 and be told we had stopped emailing them.
   *
   * `done=0` is the write failing, which the POST route now reports honestly
   * rather than papering over. It is only believed when the column agrees it
   * did not take.
   */
  const stopped = !!lead && lead.doNotContact;
  const failed = !!lead && !lead.doNotContact && done === '0';

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/35 mb-4">{COMPANY_NAME}</p>

        {!lead ? (
          <>
            <h1 className="text-3xl font-bold mb-4">That link has expired</h1>
            <p className="text-white/55 leading-relaxed">
              We could not find anything to unsubscribe. If you are still hearing from us, reply to any
              of our emails and we will sort it by hand.
            </p>
          </>
        ) : stopped ? (
          <>
            <h1 className="text-3xl font-bold mb-4">That&rsquo;s done — we&rsquo;ll stop.</h1>
            <p className="text-white/55 leading-relaxed">
              You will not get any more follow-up emails from us
              {lead.company ? ` about ${lead.company}` : ''}. Nothing else needed.
            </p>
          </>
        ) : failed ? (
          <>
            {/* Said plainly, with both ways out on the page. Somebody who is
                told it did not work presses the button again or writes to us;
                somebody who is told it worked does neither and keeps hearing
                from us, which is the outcome this whole page exists to
                prevent. */}
            <h1 className="text-3xl font-bold mb-4">That didn&rsquo;t go through</h1>
            <p className="text-white/55 leading-relaxed mb-7">
              Something on our side failed to save it, so you are still on the list. Try once more —
              or reply to any of our emails and we will take you off by hand.
            </p>
            <form action="/api/public/stop" method="post">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="rounded-xl border border-white/20 bg-white/[0.06] px-6 py-3 text-sm font-semibold hover:bg-white/[0.12] transition-colors"
              >
                Try again
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-4">Stop emailing you?</h1>
            <p className="text-white/55 leading-relaxed mb-7">
              One button and we stop the follow-ups
              {lead.company ? ` about ${lead.company}` : ''}. No account, nothing to fill in.
            </p>
            {/* A plain form post, so it works with JavaScript switched off —
                an unsubscribe that needs a working script is an unsubscribe
                that fails for the people most likely to want one. */}
            <form action="/api/public/stop" method="post">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="rounded-xl border border-white/20 bg-white/[0.06] px-6 py-3 text-sm font-semibold hover:bg-white/[0.12] transition-colors"
              >
                Yes, stop emailing me
              </button>
            </form>
          </>
        )}

        <p className="text-white/35 text-sm mt-8">
          Changed your mind, or need something?{' '}
          <a href={`mailto:${COMPANY_EMAIL}`} className="text-white/60 hover:text-white transition-colors">
            {COMPANY_EMAIL}
          </a>
        </p>
      </div>
    </main>
  );
}
