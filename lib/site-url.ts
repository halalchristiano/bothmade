/**
 * The address this site is reachable at, as a client should see it.
 *
 * Seventeen places used to read `process.env.NEXT_PUBLIC_SITE_URL` directly
 * with the same `|| 'http://localhost:3000'` fallback, and every one of them
 * builds a link that gets emailed to a customer — a care-plan offer, a
 * mockup, a payment link, a password reset.
 *
 * That meant a single misconfigured variable put the wrong domain in front of
 * every client at once, silently. Which is exactly what happened: production
 * had it set to the deployment's `bothmade.vercel.app` address, so customers
 * were being sent care-plan links on a hosting-provider domain rather than
 * the studio's own. Nothing breaks — the links work — which is why it can sit
 * there for months. It just looks like a link you shouldn't click, on the
 * one email whose entire job is to be clicked.
 *
 * So the canonical domain wins in production. A `*.vercel.app` value is a
 * deployment address, never a brand address, and treating it as one is a
 * configuration mistake this refuses to pass on to a customer. Everywhere
 * else the variable is honoured as-is, because that is how a preview
 * deployment and a laptop are supposed to work.
 */

/** The studio's own domain. Changing it here changes every emailed link. */
export const CANONICAL_SITE_URL = 'https://www.bothmade.studio';

/** Hosts that are a deployment target rather than somewhere a client should land. */
function isDeploymentHost(host: string): boolean {
  return host.endsWith('.vercel.app') || host.endsWith('.netlify.app');
}

export function resolveSiteUrl(
  configured: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  const raw = (configured || '').trim();
  if (!raw) {
    // Nothing set: production still has to produce a real address, because a
    // link to localhost in a customer's inbox is worse than no link at all.
    return nodeEnv === 'production' ? CANONICAL_SITE_URL : 'http://localhost:3000';
  }

  let host: string;
  try {
    host = new URL(raw).host;
  } catch {
    // Not a URL at all. In production that cannot be allowed to reach a
    // client-facing link; locally, leave it alone so a deliberate oddity
    // (an IP, a tunnel) still works.
    return nodeEnv === 'production' ? CANONICAL_SITE_URL : raw;
  }

  if (nodeEnv === 'production' && isDeploymentHost(host)) return CANONICAL_SITE_URL;

  // Trailing slashes double up when a path is appended (`.../care//token`),
  // and some mail clients treat the result as a different link.
  return raw.replace(/\/+$/, '');
}

/** The resolved address. A function, so tests and cron read the environment at call time. */
export function siteUrl(): string {
  return resolveSiteUrl();
}
