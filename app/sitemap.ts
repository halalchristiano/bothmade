import type { MetadataRoute } from 'next';
import { BLOG_POSTS } from '@/lib/blog';
import { CASE_STUDIES } from '@/lib/case-studies';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes: MetadataRoute.Sitemap = (
    [
      { path: '', priority: 1, changeFrequency: 'monthly' },
      // Every CTA on the site now lands here, which makes it the second most
      // important URL we have — and it was missing from the sitemap
      // entirely, which is a strange thing to be true of the page that takes
      // the money.
      { path: '/start', priority: 0.95, changeFrequency: 'monthly' },
      { path: '/web', priority: 0.9, changeFrequency: 'monthly' },
      { path: '/ios', priority: 0.9, changeFrequency: 'monthly' },
      { path: '/visionpro', priority: 0.9, changeFrequency: 'monthly' },
      { path: '/work', priority: 0.7, changeFrequency: 'monthly' },
      { path: '/blog', priority: 0.7, changeFrequency: 'weekly' },
    ] as const
  ).map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // Posts are the buyer-intent surface — "what does a website cost" is a
  // search somebody makes with a budget already in mind. Listing them
  // individually is the difference between that traffic finding us and not.
  const posts: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(`${post.date}T00:00:00Z`),
    changeFrequency: 'yearly' as const,
    priority: 0.6,
  }));

  // In-progress studies are deliberately noindex (see the metadata in
  // work/[slug]), so listing them here would only contradict the page's own
  // robots tag.
  const studies: MetadataRoute.Sitemap = CASE_STUDIES.filter(
    (study) => study.status === 'live'
  ).map((study) => ({
    url: `${SITE_URL}/work/${study.slug}`,
    lastModified: now,
    changeFrequency: 'yearly' as const,
    priority: 0.6,
  }));

  return [...routes, ...posts, ...studies];
}
