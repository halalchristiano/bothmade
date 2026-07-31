import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { LuxuryCursor } from '@/components/LuxuryCursor';
import { ClientPortal } from '@/components/portal/ClientPortal';
import { readToken } from '@/lib/portal';
import { stripeConfigured, verifyPaidSession } from '@/lib/stripe';
import { bankDetails } from '@/lib/bank';

/**
 * A client's private project page.
 *
 * Never indexed, never cached, never prerendered — the token in the URL is the
 * credential, so a copy of this sitting in a CDN or a search index would be a
 * disclosure. `robots: noindex` covers crawlers; `dynamic = 'force-dynamic'`
 * covers Next's own caching.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your project | Bothmade',
  robots: { index: false, follow: false, nocache: true },
};

export default async function ClientPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string; cancelled?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;

  const result = readToken(token);

  if (!result.ok) {
    return <PortalNotice reason={result.reason} />;
  }

  // A session id in the URL proves nothing on its own — anyone can type one.
  // Ask Stripe directly before showing a receipt.
  const paid = query.session_id ? await verifyPaidSession(query.session_id) : false;

  return (
    <main className="relative min-h-screen bg-[#05030a] text-white">
      <LuxuryCursor />
      <Nav />
      <ClientPortal
        client={result.client}
        token={token}
        paid={paid}
        cancelled={query.cancelled === '1'}
        bank={bankDetails()}
        cardEnabled={stripeConfigured()}
      />
    </main>
  );
}

/**
 * Every failure gets the same page and the same next step. A visitor with a
 * broken link cannot act on the difference between "expired" and "forged", and
 * being specific about which would tell someone probing exactly where they
 * stand — so only expiry, which is genuinely the client's business, is named.
 */
function PortalNotice({ reason }: { reason: 'unconfigured' | 'malformed' | 'bad-signature' | 'expired' }) {
  const expired = reason === 'expired';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-[#05030a] px-6 text-center text-white">
      <p className="font-mono text-xs uppercase tracking-[0.4em] text-white/35">
        {expired ? 'Link expired' : 'Link not valid'}
      </p>

      <h1
        className="mt-8 max-w-2xl font-bold leading-[1.05] tracking-tight"
        style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)' }}
      >
        {expired ? "This link has run out." : "We can't open this one."}
      </h1>

      <p className="mt-8 max-w-md text-white/45 leading-relaxed">
        {expired
          ? 'Project links last six months. Reply to any email from us and we will send you a fresh one — nothing is lost.'
          : 'It may have been copied incompletely, or it may have been replaced. Reply to any email from us and we will send a new one.'}
      </p>

      <div className="mt-12 flex flex-wrap justify-center gap-4">
        <Link
          href="/#contact"
          className="rounded-full bg-white px-8 py-3.5 text-sm font-medium text-black transition-colors hover:bg-white/85"
        >
          Get in touch
        </Link>
        <Link
          href="/"
          className="rounded-full border border-white/20 px-8 py-3.5 text-sm font-medium text-white/70 transition-colors hover:border-white/50 hover:text-white"
        >
          Bothmade home
        </Link>
      </div>
    </main>
  );
}
