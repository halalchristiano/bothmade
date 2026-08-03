import type { Metadata } from 'next';
import { WorkIndex } from '@/components/WorkIndex';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Work | Bothmade',
  description:
    'Projects in development at Bothmade — web platforms, iOS apps, and Vision Pro experiences.',
  alternates: { canonical: '/work' },
  openGraph: {
    title: 'Work | Bothmade',
    description:
      'Projects in development at Bothmade — web platforms, iOS apps, and Vision Pro experiences.',
    url: '/work',
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Work | Bothmade',
    description:
      'Projects in development at Bothmade — web platforms, iOS apps, and Vision Pro experiences.',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

export default function WorkPage() {
  return <WorkIndex />;
}
