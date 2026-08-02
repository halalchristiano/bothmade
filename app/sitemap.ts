import type { MetadataRoute } from 'next';
import { BLOG_POSTS } from '@/lib/blog';
import { CASE_STUDIES } from '@/lib/case-studies';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: '', priority: 1 },
    { path: '/web', priority: 0.9 },
    { path: '/ios', priority: 0.9 },
    { path: '/visionpro', priority: 0.9 },
    { path: '/start', priority: 0.9 },
    { path: '/work', priority: 0.7 },
    { path: '/blog', priority: 0.7 },
  ];

  // Static routes have no natural "last modified" content date of their
  // own, so a fixed constant is used instead of `new Date()` — that keeps
  // the sitemap deterministic across builds rather than reporting every
  // route as freshly modified on every deploy.
  const staticEntries: MetadataRoute.Sitemap = routes.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date('2026-08-02'),
    changeFrequency: 'monthly' as const,
    priority,
  }));

  const blogEntries: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Only published ("live") case studies are indexable — in-progress ones
  // carry `noindex` on their detail page and are deliberately excluded here.
  const caseStudyEntries: MetadataRoute.Sitemap = CASE_STUDIES.filter(
    (study) => study.status === 'live'
  ).map((study) => ({
    url: `${SITE_URL}/work/${study.slug}`,
    lastModified: new Date(`${study.year}-01-01`),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...blogEntries, ...caseStudyEntries];
}
