import type { Metadata } from 'next';
import { BlogIndex } from '@/components/BlogIndex';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Blog | Bothmade',
  description: 'Notes on how Bothmade builds — decisions, tools, and tradeoffs from real projects.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog | Bothmade',
    description: 'Notes on how Bothmade builds — decisions, tools, and tradeoffs from real projects.',
    url: '/blog',
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog | Bothmade',
    description: 'Notes on how Bothmade builds — decisions, tools, and tradeoffs from real projects.',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

export default function BlogPage() {
  return <BlogIndex />;
}
