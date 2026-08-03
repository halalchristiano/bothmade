import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { COMPANY_ADDRESS_INLINE, COMPANY_EMAIL, COMPANY_LOCATION } from '@/lib/company';

export const metadata: Metadata = {
  title: 'Privacy Policy | Bothmade',
  description: 'How Bothmade collects, uses, and protects your information.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

/**
 * Describes what the app genuinely does today — the contact form and /start
 * write a Lead, Stripe takes payment, Resend sends mail, clients get a portal
 * login, Vercel Analytics counts page views. Nothing here claims a practice
 * the code doesn't have; if the data flows change, this page changes with it.
 */
export default function PrivacyPage() {
  return (
    <main className="relative bg-[#05030a] text-white">
      <Nav />

      <section className="relative pt-40 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-white/40 text-sm mb-16">Last updated: 3 August 2026</p>

          <div className="space-y-10 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Who we are</h2>
              <p>
                Bothmade (&quot;we&quot;, &quot;us&quot;) is a web and native Apple development
                studio based in {COMPANY_LOCATION}, at {COMPANY_ADDRESS_INLINE}. This policy
                explains what we collect through bothmade.studio, why, and what you can ask us
                to do about it. Reach us any time at{' '}
                <a href={`mailto:${COMPANY_EMAIL}`} className="text-sky-300 hover:underline">
                  {COMPANY_EMAIL}
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">What we collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <span className="text-white/90">What you send us.</span> Through the contact
                  form or the pricing tool: your name, email, company, optional phone number,
                  optional budget and timeline, and whatever you write in the message. This is
                  stored as a record in our own system so an enquiry can&apos;t be lost in an
                  inbox.
                </li>
                <li>
                  <span className="text-white/90">Payment details.</span> Handled entirely by
                  Stripe. Card numbers never reach our servers and we never store them.
                </li>
                <li>
                  <span className="text-white/90">Client account data.</span> If you become a
                  client: your login credentials (password stored hashed, never in plain
                  text), project messages, and any files you upload to your portal.
                </li>
                <li>
                  <span className="text-white/90">Usage data.</span> Aggregate page views and
                  general device/browser information via Vercel Analytics, which does not use
                  cookies to track you across sites.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Why we use it</h2>
              <p>
                To reply to you, scope and build your project, take payment, keep you updated
                while work is underway, and understand which parts of this site are useful. We
                do not sell your personal information, and we do not share it for advertising.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Who else sees it</h2>
              <p>
                Only the services we need to operate, and only the data each one needs:{' '}
                <span className="text-white/90">Stripe</span> for payments,{' '}
                <span className="text-white/90">Resend</span> and Google for email delivery,{' '}
                <span className="text-white/90">Vercel</span> for hosting and analytics, and
                our database provider for storage. We may also disclose information where the
                law requires it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">How long we keep it</h2>
              <p>
                Enquiries are kept while there is a realistic prospect of working together, and
                project records for as long as we are required to for tax and legal purposes.
                Ask us to delete something sooner and we will, unless we are obliged to keep it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Your rights</h2>
              <p>
                You can ask for a copy of what we hold about you, ask us to correct it, or ask
                us to delete it — email{' '}
                <a href={`mailto:${COMPANY_EMAIL}`} className="text-sky-300 hover:underline">
                  {COMPANY_EMAIL}
                </a>
                . Because we operate from the UK, visitors in the UK and EU also have the right
                to object to processing and to complain to their data protection authority (in
                the UK, the Information Commissioner&apos;s Office).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Changes</h2>
              <p>
                If this policy changes we will update this page and the date at the top. See
                also our{' '}
                <Link href="/terms" className="text-sky-300 hover:underline">
                  Terms of Service
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
