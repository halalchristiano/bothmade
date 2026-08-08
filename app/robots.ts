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
      //
      // The four below were missed by exactly the process that sentence was
      // written to stop, and for these the cost is not an indexed page — it
      // is a false entry in the CRM, because all four are GETs that write:
      //
      //   /o   the open pixel on a cold email. A crawler fetching it records
      //        an open and can trip alertOnFirstRealOpen, so a rep is told a
      //        lead is reading their mail and calls someone who never saw it.
      //   /e   the same pixel on an invoice email. A false open moves an
      //        invoice from "never landed" to "landed and ignored", which are
      //        the two states the whole chase sequence branches on.
      //   /pay the payment link. It records the click *and* mints a live
      //        Stripe Checkout Session per request. Crawled, it manufactures
      //        both "the client clicked to pay" — which is what escalates to
      //        a phone call — and Stripe sessions nobody asked for.
      //   /l   the Drive hop. Harmless to fetch, but it is a link we emailed
      //        one client and it has no business in an index.
      //
      // These are still fetched by mail clients, which is the point of them;
      // robots.txt is honoured by the crawlers and link-preview bots that
      // would otherwise be counted as people. tests/lib/robots.test.ts now
      // walks app/ and fails on any new dynamic route that is neither listed
      // here nor declared public, so the next one cannot be missed quietly.
      disallow: [
        '/api/',
        '/admin',
        '/client',
        '/auth',
        '/b/',
        '/care',
        '/change',
        '/checkout',
        '/e/',
        '/f/',
        '/l/',
        '/m/',
        '/o/',
        '/pay',
        '/sign',
        '/status',
        '/stop',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
