import type { Metadata } from 'next';
import Link from 'next/link';
import { PurchaseTrack } from './PurchaseTrack';

export const metadata: Metadata = {
  title: 'Payment received',
  // A receipt is not a page to be found in search. Same treatment as the
  // other post-transaction screens.
  robots: { index: false, follow: false },
};

/**
 * The wordmark, as the client portal draws it. Written out here rather than
 * imported from components/Nav, which pulls the whole marketing navigation
 * with it — this page deliberately has no way out except forward.
 */
function Logo() {
  return (
    <span className="text-2xl font-bold tracking-tight">
      <span
        aria-hidden="true"
        className="text-transparent"
        style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}
      >
        both
      </span>
      <span aria-hidden="true">made</span>
      <span className="sr-only">Bothmade</span>
    </span>
  );
}

/**
 * Shown after any Stripe checkout redirect. The copy differs by payment kind:
 * a first payment (`type=welcome`) creates the account and emails a temporary
 * password, but this same page is the redirect target for balance payments by
 * existing clients — telling a mid-project client "we've created your account"
 * was wrong, so that line only shows for welcome payments.
 *
 * `type=care` is a third case and the one that must not say "Payment
 * Received": a care plan whose first months are already covered takes nothing
 * from the card today, so a receipt for money that didn't move is a support
 * email waiting to happen.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; session_id?: string }>;
}) {
  const { type, session_id: sessionId } = await searchParams;
  const isWelcome = type === 'welcome';
  const isCarePlan = type === 'care';

  if (isCarePlan) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex flex-col items-center justify-center px-4 py-16">
        <PurchaseTrack kind="care" sessionId={sessionId} />
        <Logo />
        <div className="mt-8 w-full max-w-lg text-center">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-10">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-400/25 to-purple-500/25 border border-white/15 text-sky-200 flex items-center justify-center text-2xl mx-auto mb-6">
              ✓
            </div>
            <h1 className="text-3xl font-bold mb-4">You&apos;re All Set</h1>
            <p className="text-white/55 leading-relaxed mb-6">
              Your care plan is active. We&apos;ve emailed you the full schedule — what you pay,
              when it starts, and when the introductory rate ends.
            </p>
            <p className="text-white/55 leading-relaxed mb-8">
              An itemized invoice will arrive by email every month. You can cancel any time.
            </p>
            <Link
              href="/client/login"
              className="inline-block rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-6 py-3 font-semibold text-black hover:opacity-90 transition-opacity"
            >
              Go to Your Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05030a] text-white flex flex-col items-center justify-center px-4 py-16">
      <PurchaseTrack kind={isWelcome ? 'welcome' : 'balance'} sessionId={sessionId} />
      <Logo />
      <div className="mt-8 w-full max-w-lg text-center">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-10">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-400/25 to-purple-500/25 border border-white/15 text-sky-200 flex items-center justify-center text-2xl mx-auto mb-6">
            ✓
          </div>
          <h1 className="text-3xl font-bold mb-4">Payment Received</h1>
          {isWelcome ? (
            <>
              <p className="text-white/55 leading-relaxed mb-6">
                Thanks for starting your project with Bothmade! We&apos;ve created your account
                and sent your login details to your email, along with a temporary password.
              </p>
              <p className="text-white/55 leading-relaxed mb-8">
                Check your inbox, then log in to your dashboard to track progress and message
                the team.
              </p>
            </>
          ) : (
            <>
              <p className="text-white/55 leading-relaxed mb-6">
                Thanks — your payment has gone through and will show up on your project shortly.
              </p>
              <p className="text-white/55 leading-relaxed mb-8">
                Log in to your dashboard to track progress and message the team.
              </p>
            </>
          )}
          <Link
            href="/client/login"
            className="inline-block rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-6 py-3 font-semibold text-black hover:opacity-90 transition-opacity"
          >
            {isWelcome ? 'Go to Client Login' : 'Go to Your Dashboard'}
          </Link>
        </div>
      </div>
    </main>
  );
}
