import type { Metadata } from 'next';
import { FAQ_ITEMS } from './page';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Get a Price | Bothmade',
  description:
    'Configure a Website, Web App, or iOS App and see transparent, itemized pricing update live — the same numbers our checkout charges against.',
  alternates: { canonical: '/start' },
  openGraph: {
    title: 'Get a Price | Bothmade',
    description:
      'Configure a Website, Web App, or iOS App and see transparent, itemized pricing update live.',
    url: '/start',
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Get a Price | Bothmade',
    description:
      'Configure a Website, Web App, or iOS App and see transparent, itemized pricing update live.',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* FAQPage structured data, sourced from the same FAQ_ITEMS array the
          page itself renders — so the markup can never drift from the copy. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ_ITEMS.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.a,
              },
            })),
            url: `${SITE_URL}/start`,
          }),
        }}
      />
      {children}
    </>
  );
}
