import type { Metadata } from 'next';
import { BlogIndex } from '@/components/BlogIndex';

export const metadata: Metadata = {
  title: 'Blog | Bothmade',
  description: 'Notes on how Bothmade builds — decisions, tools, and tradeoffs from real projects.',
  alternates: { canonical: '/blog' },
};

export default function BlogPage() {
  return <BlogIndex />;
}
