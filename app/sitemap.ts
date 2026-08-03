import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

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
    { path: '/blog', priority: 0.7 },
    // Low priority, but a crawler finding them is part of looking legitimate.
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: changeFrequency ?? ('monthly' as const),
    priority,
  }));
}
