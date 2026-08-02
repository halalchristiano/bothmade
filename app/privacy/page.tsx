import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy | Bothmade',
  description: 'How Bothmade collects, uses, and protects your information.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="relative bg-[#05030a] text-white">
      <Nav />

      <section className="relative pt-40 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-white/40 text-sm mb-16">Last updated: August 2, 2026</p>

          <div className="space-y-10 text-white/70 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Who we are</h2>
              <p>
                Bothmade ("we," "us," "our") is a web and native Apple development studio.
                This policy explains what information we collect through bothmade.studio,
                how we use it, and the choices you have. Contact us at{' '}
                <a href="mailto:info@bothmade.studio" className="text-sky-300 hover:underline">
                  info@bothmade.studio
                </a>{' '}
                with any questions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Information we collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <span className="text-white/90">Contact and project details</span> you submit
                  through our contact form or the /start pricing tool — name, email, company,
                  phone number, and project description.
                </li>
                <li>
                  <span className="text-white/90">Payment information</span> when you start a
                  project, processed directly by Stripe. We never see or store your full card
                  details.
                </li>
                <li>
                  <span className="text-white/90">Account information</span> for clients,
                  including login credentials and project communications, if you become a
                  client and use the client portal.
                </li>
                <li>
                  <span className="text-white/90">Usage data</span> such as pages visited and
                  general device/browser information, collected via analytics.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">How we use it</h2>
              <p>
                We use this information to respond to inquiries, scope and deliver projects,
                process payments, communicate about active work, and understand how visitors
                use our site so we can improve it. We do not sell your personal information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Sharing</h2>
              <p>
                We share information only with service providers who help us operate — payment
                processing (Stripe), email delivery (Resend), and hosting/analytics providers —
                and only as needed to provide our services, or when required by law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Your choices</h2>
              <p>
                You can ask us to access, correct, or delete the personal information we hold
                about you at any time by emailing{' '}
                <a href="mailto:info@bothmade.studio" className="text-sky-300 hover:underline">
                  info@bothmade.studio
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">Changes to this policy</h2>
              <p>
                We may update this policy from time to time. Changes will be posted on this
                page with an updated date.
              </p>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
