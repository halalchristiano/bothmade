import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep private and transactional areas out of the index — the admin and
      // client portals, checkout, the per-lead sign page, and status links.
      disallow: ['/api/', '/admin/', '/client/', '/checkout/', '/sign/', '/status/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
