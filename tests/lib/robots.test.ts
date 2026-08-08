import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';

/**
 * robots.txt is the only thing standing between a crawler and a set of GET
 * endpoints that write to the database.
 *
 * Most of this file guards the obvious: capability links where the URL *is*
 * the credential, so a crawled one is a proposal or a client's project status
 * sitting in a search result. But four of these routes are worse than
 * indexable — they are GETs with side effects. `/o` and `/e` are open pixels,
 * `/pay` records a click and mints a Stripe Checkout Session. Anything
 * fetching those is counted as a person: a rep gets told a lead is reading
 * their mail, an invoice moves from "never landed" to "landed and ignored",
 * and the chase sequence branches on exactly that distinction.
 *
 * The list in app/robots.ts had already been extended once, with a comment
 * saying "every token route belongs here, not just the ones that were noticed
 * first". It still missed four. A hand-maintained list of private routes and
 * a hand-maintained list of the routes that exist will drift again, so the
 * test below reads the filesystem instead of trusting either.
 */

const rules = robots().rules as { disallow: string[] };
const DISALLOW = rules.disallow;

/** Does robots.txt tell a crawler to stay out of this path? */
function isDisallowed(route: string): boolean {
  return DISALLOW.some((rule) => route === rule || route.startsWith(rule));
}

/**
 * Top-level URL segments that are public on purpose, with the reason.
 *
 * A dynamic route found under app/ must be here or in the disallow list.
 * Adding to this set is a deliberate statement that the page is meant to be
 * found by strangers — which is the whole point of making it explicit.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  blog: 'the notes index — written to be found',
  work: 'case studies, the main thing a prospect reads before enquiring',
  rigidized: 'a published mockup demo, linked from the work page',
};

/**
 * Every top-level route segment under app/ that has a dynamic child.
 *
 * Route groups — the `(mockups)` and `(businesses)` parentheses — are
 * organisational and never appear in a URL, so they are skipped and their
 * children are treated as top level. That matters: `/rigidized/patterns/[slug]`
 * lives under two of them and is a real, public URL.
 */
function dynamicTopLevelRoutes(): string[] {
  const appDir = path.join(process.cwd(), 'app');
  const found = new Set<string>();

  const walk = (dir: string, topSegment: string | null) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const isGroup = name.startsWith('(') && name.endsWith(')');
      const isDynamic = name.startsWith('[');

      // A route group contributes nothing to the URL; keep the segment we had.
      const segment = isGroup ? topSegment : (topSegment ?? (isDynamic ? null : name));

      if (isDynamic && segment) found.add(segment);
      walk(path.join(dir, name), segment);
    }
  };

  walk(appDir, null);
  return [...found].sort();
}

describe('the routes that exist', () => {
  it('finds the dynamic ones by reading app/, not from a list', () => {
    // Guards the test itself: a walker that silently found nothing would make
    // every assertion below vacuously pass.
    const routes = dynamicTopLevelRoutes();
    expect(routes.length).toBeGreaterThan(10);
    expect(routes).toEqual(expect.arrayContaining(['o', 'e', 'pay', 'f', 'm', 'stop']));
  });

  it('has every dynamic route either disallowed or declared public', () => {
    // Checked as `/<route>/<something>` rather than `/<route>`, because that
    // is the only URL shape a dynamic route ever produces and it is what the
    // rules are written against: `Disallow: /b/` blocks `/b/acme-dental`, and
    // deliberately does not block a bare `/b` — see the /blog case below.
    const unclassified = dynamicTopLevelRoutes().filter(
      (route) => !isDisallowed(`/${route}/sample-id`) && !(route in PUBLIC_ROUTES)
    );

    expect(
      unclassified,
      `These dynamic routes are neither disallowed in app/robots.ts nor listed as ` +
        `public in this test: ${unclassified.join(', ')}. If the route carries a ` +
        `token or an id, add it to the disallow list. If strangers are meant to ` +
        `find it, add it to PUBLIC_ROUTES with a reason.`
    ).toEqual([]);
  });
});

describe('the GETs that write', () => {
  // These are the ones where a crawl does not just index something — it
  // fabricates a record that a person then acts on.
  it.each([
    ['/o/', 'cold-email open pixel — a fetch is recorded as a lead opening mail'],
    ['/e/', 'invoice open pixel — a fetch moves an invoice to "landed and ignored"'],
    ['/pay', 'records a click and mints a live Stripe Checkout Session per request'],
  ])('keeps crawlers out of %s (%s)', (route) => {
    expect(isDisallowed(route)).toBe(true);
  });
});

describe('the capability links', () => {
  it.each([
    ['/b/', "a lead's branded mockup"],
    ['/care', 'a care-plan offer with a live checkout'],
    ['/change', 'a change order awaiting approval'],
    ['/f/', "a client's brief form"],
    ['/l/', 'the emailed Drive hop'],
    ['/m/', "a client's mockup"],
    ['/sign', 'a proposal to be signed'],
    ['/status', "a client's project status"],
    ['/stop', 'an unsubscribe that must never be triggered by a crawl'],
  ])('keeps crawlers out of %s (%s)', (route) => {
    expect(isDisallowed(route)).toBe(true);
  });
});

describe('the login walls and the API', () => {
  it.each(['/api/', '/admin', '/client', '/auth', '/checkout'])('excludes %s', (route) => {
    expect(isDisallowed(route)).toBe(true);
  });
});

describe('what must stay crawlable', () => {
  it('still lets the marketing site be indexed', () => {
    expect(rules.allow).toBe('/');
    for (const route of ['/', '/about', '/work', '/blog', '/start', '/terms', '/privacy']) {
      expect(isDisallowed(route), `${route} must stay indexable`).toBe(false);
    }
  });

  it('does not accidentally swallow a public route with a shared prefix', () => {
    // '/b/' rather than '/b' on purpose — '/b' as a prefix rule would match
    // /blog and delist the entire notes section.
    expect(isDisallowed('/blog')).toBe(false);
    expect(isDisallowed('/blog/we-deleted-the-empty-box')).toBe(false);
  });

  it('points crawlers at the sitemap', () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
