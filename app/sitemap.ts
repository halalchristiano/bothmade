import type { MetadataRoute } from 'next';
import { BLOG_POSTS } from '@/lib/blog';
import { CASE_STUDIES } from '@/lib/case-studies';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: {
    path: string;
    priority: number;
    changeFrequency: 'weekly' | 'monthly' | 'yearly';
  }[] = [
    { path: '', priority: 1, changeFrequency: 'weekly' },
    { path: '/web', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/ios', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/visionpro', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/start', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/work', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/blog', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
  ];

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map(
    ({ path, priority, changeFrequency }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    })
  );

  const blogEntries: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    // Clamp to now so a post dated in the future doesn't publish a future
    // lastModified, which search engines distrust.
    lastModified: new Date(Math.min(new Date(post.date).getTime(), now.getTime())),
    changeFrequency: 'yearly',
    priority: 0.6,
  }));

  // Only published (live) case studies — in-progress entries are noindex and
  // must never be advertised to crawlers.
  const workEntries: MetadataRoute.Sitemap = CASE_STUDIES.filter(
    (s) => s.status === 'live'
  ).map((s) => ({
    url: `${SITE_URL}/work/${s.slug}`,
    lastModified: now,
    changeFrequency: 'yearly',
    priority: 0.6,
  }));

  return [...staticEntries, ...blogEntries, ...workEntries];
}
