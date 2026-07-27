import type { Metadata } from 'next';
import { WorkIndex } from '@/components/WorkIndex';

export const metadata: Metadata = {
  title: 'Work | Bothmade',
  description:
    'Projects in development at Bothmade — web platforms, iOS apps, and Vision Pro experiences.',
  alternates: { canonical: '/work' },
};

export default function WorkPage() {
  return <WorkIndex />;
}
