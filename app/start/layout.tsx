import type { Metadata } from 'next';
import { resolveSiteUrl } from '@/lib/site-url';
import { FAQ_ITEMS } from '@/lib/start-faq';

const SITE_URL = resolveSiteUrl();

/**
 * /start is a client component (the configurator is all state), and a client
 * component cannot export `metadata` — so the pricing page, the one a search
 * visitor is most likely to convert on, was shipping with no title, no
 * description, and no canonical. This layout supplies them.
 *
 * Open Graph images are not declared here on purpose: app/opengraph-image.tsx
 * is a file convention Next applies automatically to every route beneath it,
 * so repeating it in metadata only risks emitting the tag twice.
 */
export const metadata: Metadata = {
  title: 'Pricing — Build Your Project | Bothmade',
  description:
    'Configure your website, web app, iOS, macOS, or Vision Pro build and see the price update live. Fixed scope, fixed price, 50% deposit to start — no quote-by-email.',
  alternates: { canonical: '/start' },
  openGraph: {
    title: 'Pricing — Build Your Project | Bothmade',
    description:
      'Configure your build and see transparent pricing update live. Websites from $3,000, iOS apps from $10,000.',
    url: '/start',
    type: 'website',
  },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* FAQPage structured data, generated from the same array the page
          renders — the two can't drift, and these are exactly the questions
          someone types into a search box before hiring a studio. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            url: `${SITE_URL}/start`,
            mainEntity: FAQ_ITEMS.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }),
        }}
      />
      {children}
    </>
  );
}
