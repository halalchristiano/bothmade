import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service | Bothmade',
  description:
    'The terms that govern use of the Bothmade website and the design and development services we provide.',
  alternates: { canonical: '/terms' },
};

// NOTE FOR THE OWNER: honest starting terms based on how the site and pricing
// actually work today (fixed-scope proposals, 50% deposit, balance before
// launch, ownership on final payment). Fill in [legal entity] and [governing
// law / jurisdiction] and have counsel review before relying on them.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="August 2, 2026">
      <p>
        These terms govern your use of this website and any design or development services you
        engage Bothmade (operated by <strong>[legal entity name]</strong>) to provide. By using
        the site or engaging us, you agree to them. A signed project agreement, where one exists,
        takes precedence over these terms for that project.
      </p>

      <h2>Our services</h2>
      <p>
        We design and build websites and native Apple software. The specific scope, timeline, and
        price of any project are set out in the proposal and agreement we prepare for you.
      </p>

      <h2>Proposals, pricing, and payment</h2>
      <ul>
        <li>Prices shown in the project configurator are estimates based on the options selected.</li>
        <li>
          Standard terms are a <strong>50% deposit</strong> to begin Discovery, with the remaining
          balance due once Build is complete and before Launch, unless your agreement says
          otherwise.
        </li>
        <li>Payments are processed securely by Stripe. Fees are stated in your proposal.</li>
      </ul>

      <h2>Refunds</h2>
      <p>
        Every project includes a written agreement covering what counts as a delay and when a
        refund applies. A missed estimate alone is not grounds for a refund, since most schedule
        shifts come from feedback cycles rather than idle time on our end — but you are protected
        if we fail to deliver as agreed. The full agreement is provided for you to review before
        you pay anything beyond the deposit.
      </p>

      <h2>Your responsibilities</h2>
      <p>
        Projects depend on timely feedback, approvals, and any content or access we need from you.
        Delays in providing these can affect the timeline.
      </p>

      <h2>Intellectual property</h2>
      <p>
        On receipt of final payment, ownership of the deliverables produced for your project
        transfers to you, except for any third-party components and our own pre-existing tools and
        libraries, which remain owned by their respective owners and licensed to you as part of
        the work.
      </p>

      <h2>Warranties and liability</h2>
      <p>
        We provide our services with reasonable skill and care. To the fullest extent permitted by
        law, the site and services are otherwise provided &quot;as is&quot;, and our total
        liability arising from a project is limited to the fees paid for that project.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of <strong>[jurisdiction]</strong>, and any disputes
        will be subject to the courts of that jurisdiction.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms from time to time. The date at the top of this page shows when
        they last changed.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email{' '}
        <a href="mailto:contact@bothmade.studio">contact@bothmade.studio</a>.
      </p>
    </LegalPage>
  );
}
