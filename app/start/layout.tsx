import type { Metadata } from 'next';

// The /start page is a client component and can't export metadata itself, so
// it otherwise inherited the homepage's title AND its canonical ('/') — the
// pricing page declaring the homepage as its canonical. Give the primary
// commercial page its own metadata and self-canonical.
export const metadata: Metadata = {
  title: 'Pricing | Bothmade',
  description:
    'Configure your web or Apple-native project and see the price instantly. Transparent, fixed-scope pricing — a 50% deposit begins Discovery, the balance is due before launch.',
  alternates: { canonical: '/start' },
  openGraph: {
    title: 'Pricing | Bothmade',
    description:
      'Configure your project and see the price instantly. Fixed-scope pricing, 50% deposit to begin.',
    url: '/start',
    type: 'website',
  },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
