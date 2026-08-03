import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The CRM, the client portal, and every capability-link page are
      // private surfaces. Left crawlable, a signing URL or a project status
      // page can end up in a search result, and the admin login shows up as
      // a public page of the site.
      disallow: ['/api/', '/admin', '/client', '/checkout', '/sign', '/status'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
