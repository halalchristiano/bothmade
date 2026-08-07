import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/site-url';

const SITE_URL = resolveSiteUrl();

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
      // Every token route belongs here, not just the ones that were noticed
      // first: /m is a client's mockup, /f their brief, /change a change
      // order they are being asked to approve, /stop an unsubscribe that
      // must never be triggered by something crawling it. /b is a lead's
      // branded mockup, /auth a password-reset form.
      disallow: [
        '/api/',
        '/admin',
        '/client',
        '/auth',
        '/b/',
        '/care',
        '/change',
        '/checkout',
        '/f/',
        '/m/',
        '/sign',
        '/status',
        '/stop',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
