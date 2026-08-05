import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Playfair_Display, Poppins } from 'next/font/google';
import { buildBrochure, type BrochureInput } from '@/lib/brochure';
import { MONOGRAM } from '@/lib/brochures/monogram';
import { BrochureDoc } from './BrochureDoc';

/**
 * A client brochure, at its own address.
 *
 * Deliberately not indexed and deliberately not linked from anywhere: this
 * is a document about one prospect, priced for them, and the only way to it
 * is the link we send. That is also why there is no share token — nothing
 * here is confidential to *them*, it is a proposal we wrote, and a token on
 * a link a client forwards to their business partner is a link that stops
 * working at exactly the wrong moment.
 */

// The concept's own type: a geometric sans for the headings, a Didone italic
// for the taglines and the pull quotes. Loading them here rather than in the
// root layout keeps them off every other page in the site.
const sans = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-brochure-sans',
  display: 'swap',
});

const serif = Playfair_Display({
  subsets: ['latin'],
  style: ['italic'],
  weight: ['400', '500'],
  variable: '--font-brochure-serif',
  display: 'swap',
});

const BROCHURES: Record<string, BrochureInput> = {
  [MONOGRAM.slug]: MONOGRAM,
};

export function generateStaticParams() {
  return Object.keys(BROCHURES).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const input = BROCHURES[slug];
  if (!input) return { title: 'Not found', robots: { index: false, follow: false } };

  return {
    title: `${input.company} — a concept, and what it would cost`,
    description: input.cover.standfirst,
    robots: { index: false, follow: false },
  };
}

export default async function BrochurePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const input = BROCHURES[slug];
  if (!input) notFound();

  return (
    <div className={`${sans.variable} ${serif.variable}`}>
      <BrochureDoc brochure={buildBrochure(input)} />
    </div>
  );
}
