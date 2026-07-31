import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Client portal links are credentials. The pages already send
      // noindex — this stops a crawler requesting them at all.
      disallow: ['/api/', '/client/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
