import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy | Bothmade',
  description:
    'How Bothmade collects, uses, and protects the information you share through our website, forms, and client portal.',
  alternates: { canonical: '/privacy' },
};

// NOTE FOR THE OWNER: this is an honest, accurate starting policy based on what
// the site actually does today. Before running ads, fill in the bracketed
// legal specifics ([legal entity], [address], [jurisdiction]) and have counsel
// review it — ad networks require a reachable, accurate privacy policy.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 2, 2026">
      <p>
        This policy explains what information Bothmade (&quot;we&quot;, &quot;us&quot;) collects when
        you use this website, submit an enquiry, configure a project, or use the client
        portal — and what we do with it. Bothmade is operated by{' '}
        <strong>[legal entity name]</strong>, <strong>[business address]</strong>. Questions?
        Email <a href="mailto:contact@bothmade.studio">contact@bothmade.studio</a>.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Details you give us.</strong> When you use the contact form or the project
          configurator, we collect your name, email address, company, phone number (if you
          provide it), and anything you write to us.
        </li>
        <li>
          <strong>Payment information.</strong> Payments are processed by Stripe. We do not
          receive or store your full card number — Stripe handles card data directly. We keep a
          record of the amount, date, and what it was for.
        </li>
        <li>
          <strong>Client account data.</strong> If you become a client, we hold your account
          details, project information, messages you exchange with us, and files you upload.
        </li>
        <li>
          <strong>Basic usage data.</strong> Like most sites, our host records standard technical
          information (such as IP address and browser type) for security and reliability, and we
          may use privacy-friendly, cookieless analytics to understand which pages are visited.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use a single essential cookie to keep you signed in to the client or team portal. We
        do not use advertising or cross-site tracking cookies. If we enable analytics, we use a
        privacy-friendly provider that does not set tracking cookies or sell your data.
      </p>

      <h2>How we use your information</h2>
      <ul>
        <li>To respond to enquiries and prepare proposals.</li>
        <li>To deliver, manage, and support projects you engage us for.</li>
        <li>To process payments and send receipts and account emails.</li>
        <li>To keep the site secure and working, and to comply with our legal obligations.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We do not sell your personal information. We share it only with the service providers we
        rely on to run the business — currently our hosting provider (Vercel), our payment
        processor (Stripe), and our email provider (Resend) — and only as needed to provide the
        service. We may also disclose information where required by law.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep enquiry and client information for as long as needed to provide our services and
        to meet legal, accounting, and tax requirements, then delete or anonymise it.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You can ask us to access, correct, or delete the personal information we hold about you.</li>
        <li>You can unsubscribe from non-essential emails at any time.</li>
        <li>
          Depending on where you live, you may have additional rights under laws such as the GDPR
          or CCPA. To exercise any of these, email{' '}
          <a href="mailto:contact@bothmade.studio">contact@bothmade.studio</a>.
        </li>
      </ul>

      <h2>Children</h2>
      <p>This site and our services are intended for businesses and are not directed to children.</p>

      <h2>Changes</h2>
      <p>
        We may update this policy from time to time. When we do, we&apos;ll change the date at the
        top of this page.
      </p>

      <h2>Contact</h2>
      <p>
        For any privacy question or request, email{' '}
        <a href="mailto:contact@bothmade.studio">contact@bothmade.studio</a>.
      </p>
    </LegalPage>
  );
}
