import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service | Bothmade',
  description: 'The terms that govern use of bothmade.studio and Bothmade projects.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="relative bg-[#05030a] text-white">
      <Nav />

      <section className="relative pt-40 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Terms of Service</h1>
          <p className="text-white/40 text-sm mb-16">Last updated: August 2, 2026</p>

          <div className="space-y-10 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Overview</h2>
              <p>
                These terms govern your use of bothmade.studio and any project engagement with
                Bothmade ("we," "us," "our"). By using this site or starting a project with us,
                you agree to these terms. Every paid project is additionally governed by a
                written project agreement provided before any payment beyond a deposit is
                collected — where the two differ, the signed project agreement controls.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Site use</h2>
              <p>
                You may browse and use this site for lawful purposes only. Content on this
                site — including case studies, pricing tools, and copy — is provided for
                informational purposes and does not constitute a binding offer until confirmed
                in writing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Pricing and payment</h2>
              <p>
                Prices generated through our /start tool are estimates based on the selections
                you make. Starting a project requires a 50% deposit, with the remaining balance
                due once Build is complete and before Launch, unless otherwise agreed in
                writing. Payments are processed securely by Stripe.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Project engagements</h2>
              <p>
                Scope, deliverables, timelines, and refund conditions for any project are set
                out in the written agreement you receive and sign before work begins beyond
                Discovery. Nothing on this site overrides that agreement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Intellectual property</h2>
              <p>
                Unless otherwise agreed in a project contract, Bothmade retains ownership of
                pre-existing tools, frameworks, and internal libraries used to deliver a
                project. Ownership of custom deliverables transfers to the client on final
                payment, as detailed in the project agreement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Limitation of liability</h2>
              <p>
                To the extent permitted by law, Bothmade is not liable for indirect,
                incidental, or consequential damages arising from use of this site or a
                delivered project, beyond amounts actually paid for the relevant engagement.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
              <p>
                Questions about these terms can be sent to{' '}
                <a href="mailto:info@bothmade.studio" className="text-sky-300 hover:underline">
                  info@bothmade.studio
                </a>
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
