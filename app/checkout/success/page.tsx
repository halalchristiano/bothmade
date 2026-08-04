import Link from 'next/link';
import { PurchaseTrack } from './PurchaseTrack';

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
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const isWelcome = type === 'welcome';
  const isCarePlan = type === 'care';

  if (isCarePlan) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex items-center justify-center px-4">
        <PurchaseTrack kind="care" />
        <div className="w-full max-w-lg text-center">
          <div className="bg-white rounded-2xl shadow-lg p-10">
            <div className="w-16 h-16 rounded-full bg-black text-white flex items-center justify-center text-3xl mx-auto mb-6">
              ✓
            </div>
            <h1 className="text-3xl font-bold mb-4">You&apos;re All Set</h1>
            <p className="text-gray-600 mb-6">
              Your care plan is active. We&apos;ve emailed you the full schedule — what you pay,
              when it starts, and when the introductory rate ends.
            </p>
            <p className="text-gray-600 mb-8">
              An itemized invoice will arrive by email every month. You can cancel any time.
            </p>
            <Link
              href="/client/login"
              className="inline-block bg-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-900 transition-colors"
            >
              Go to Your Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex items-center justify-center px-4">
      <PurchaseTrack kind={isWelcome ? 'welcome' : 'balance'} />
      <div className="w-full max-w-lg text-center">
        <div className="bg-white rounded-2xl shadow-lg p-10">
          <div className="w-16 h-16 rounded-full bg-black text-white flex items-center justify-center text-3xl mx-auto mb-6">
            ✓
          </div>
          <h1 className="text-3xl font-bold mb-4">Payment Received</h1>
          {isWelcome ? (
            <>
              <p className="text-gray-600 mb-6">
                Thanks for starting your project with Bothmade! We&apos;ve created your account
                and sent your login details to your email, along with a temporary password.
              </p>
              <p className="text-gray-600 mb-8">
                Check your inbox, then log in to your dashboard to track progress and message
                the team.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-600 mb-6">
                Thanks — your payment has gone through and will show up on your project shortly.
              </p>
              <p className="text-gray-600 mb-8">
                Log in to your dashboard to track progress and message the team.
              </p>
            </>
          )}
          <Link
            href="/client/login"
            className="inline-block bg-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-900 transition-colors"
          >
            {isWelcome ? 'Go to Client Login' : 'Go to Your Dashboard'}
          </Link>
        </div>
      </div>
    </main>
  );
}
