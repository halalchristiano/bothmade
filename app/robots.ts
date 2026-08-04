import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Every private surface, not just the API. `/sign/[leadId]`,
      // `/status/[projectId]` and `/care/[token]` are capability links — the
      // URL *is* the credential — so a crawled one is a proposal, a client's
      // project status, or a live checkout for a monthly charge sitting in a
      // search result. `/admin` and `/client` are login walls that have no
      // business appearing as pages of the site.
      disallow: ['/api/', '/admin', '/client', '/care', '/checkout', '/sign', '/status'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
