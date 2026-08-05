import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/site-url';
import { BLOG_POSTS } from '@/lib/blog';
import { CASE_STUDIES } from '@/lib/case-studies';

const SITE_URL = resolveSiteUrl();

/**
 * Static routes have no content date of their own. Using `new Date()` would
 * report every page as modified on every deploy, which trains a crawler to
 * ignore the field — so the listing date is fixed and only moves when
 * someone changes it deliberately.
 */
const STATIC_LAST_MODIFIED = new Date('2026-08-03');

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: '', priority: 1 },
    // The pricing configurator — the page an enquiry actually converts on,
    // and it was missing from this list entirely.
    { path: '/start', priority: 0.9 },
    { path: '/web', priority: 0.9 },
    { path: '/ios', priority: 0.9 },
    { path: '/visionpro', priority: 0.9 },
    { path: '/work', priority: 0.7 },
    // Where a brand search ("who are bothmade") should land, and the page a
    // buyer opens to decide whether we're real.
    { path: '/about', priority: 0.8 },
    { path: '/blog', priority: 0.7 },
    // Low priority, but a crawler finding them is part of looking legitimate.
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
  ];

  const staticEntries: MetadataRoute.Sitemap = routes.map(
    ({ path, priority, changeFrequency }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: changeFrequency ?? ('monthly' as const),
      priority,
    })
  );

  // The blog is the largest indexable surface on the site and none of it was
  // listed — only /blog itself. Each post carries its own publication date,
  // which is a real lastModified rather than a stand-in.
  const blogEntries: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Only published work. The concept studies are `noindex` on their own
  // pages, and submitting a URL we're asking not to index is a contradiction.
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
