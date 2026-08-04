import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { COMPANY_EMAIL } from '@/lib/company';

export const metadata: Metadata = {
  title: 'Terms of Service | Bothmade',
  description: 'The terms that govern use of bothmade.studio and Bothmade projects.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
};

/**
 * Deliberately thin on project specifics: the signed project agreement
 * (lib/contract-terms.ts) is the document that actually governs an engagement,
 * and two sources of truth on scope, refunds, or IP is how they end up
 * disagreeing. This page covers use of the site and defers on everything else.
 */
export default function TermsPage() {
  return (
    <main className="relative bg-[#05030a] text-white">
      <Nav />

      <section className="relative pt-40 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Terms of Service</h1>
          <p className="text-white/40 text-sm mb-16">Last updated: 3 August 2026</p>

          <div className="space-y-10 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Overview</h2>
              <p>
                These terms cover your use of bothmade.studio. Every paid project is
                additionally governed by a written project agreement, which you receive and
                sign before work begins. Where these terms and that agreement differ, the
                signed agreement controls.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Using this site</h2>
              <p>
                Browse and use the site for lawful purposes. The copy, case studies, and
                pricing tool are informational: a configuration produced by the pricing tool
                is an estimate based on what you selected, not a binding quote, until we
                confirm scope in writing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Case studies</h2>
              <p>
                Some write-ups in our work section describe products we are building
                ourselves rather than client engagements. Those are labelled as such on the
                page, and any figures in them come from our own development builds.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Payment</h2>
              <p>
                Starting a project requires a 50% deposit. Nothing is charged from this
                site: the estimate on the pricing page starts a conversation, and payment
                is only requested once the scope is agreed and we send you an invoice.
                The remaining balance is due once Build is complete and before Launch, unless
                we agree something else in writing. Anything under &quot;Ongoing Care&quot; is
                month-to-month, billed after the first month, and cancellable with 30 days
                notice. Payments are processed by Stripe; we never see your card details.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Scope, delivery and refunds</h2>
              <p>
                Deliverables, timelines, change orders, and the circumstances in which a refund
                applies are set out in your project agreement. Nothing on this site overrides
                it, and you will have read it before paying anything beyond the deposit.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Ownership</h2>
              <p>
                Ownership of the custom work we build for you transfers on final payment. We
                keep rights to our own general-purpose tools and libraries — the things not
                specific to your project — and license them to you as part of what we deliver.
                The detail is in the project agreement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Liability</h2>
              <p>
                To the extent the law allows, our liability arising from this site or a
                delivered project is limited to the amount actually paid for that engagement,
                and we are not liable for indirect or consequential loss. Nothing here limits
                liability that cannot lawfully be limited.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Governing law</h2>
              <p>
                These terms are governed by the laws of England and Wales, whose courts have
                jurisdiction over any dispute — unless your project agreement specifies
                otherwise, in which case that agreement governs.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
              <p>
                Questions about these terms:{' '}
                <a href={`mailto:${COMPANY_EMAIL}`} className="text-sky-300 hover:underline">
                  {COMPANY_EMAIL}
                </a>. See also our{' '}
                <Link href="/privacy" className="text-sky-300 hover:underline">
                  Privacy Policy
                </Link>.
              </p>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
