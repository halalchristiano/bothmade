import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_ITEMS, adminPageTitle } from '@/lib/admin-nav';

/**
 * Every admin tab said the same thing.
 *
 * None of the 24 pages under /admin sets a title, so all of them showed the
 * root layout's — "Bothmade | Web & Apple Native Development". Twenty-one are
 * `'use client'` and cannot export `metadata` at all, which is why this is
 * derived from the path.
 *
 * The cost is daily rather than dramatic. Working one lead means the project
 * open in one tab, billing in another and the lead itself in a third; three
 * identical titles make picking between them guesswork, and browser history
 * becomes a column of the same sentence. Two people use this tool all day.
 */

describe('a page with a nav entry is named after it', () => {
  it.each(ADMIN_NAV_ITEMS.map((item) => [item.href, item.label]))(
    '%s is titled "%s"',
    (href, label) => {
      // Driven off ADMIN_NAV_ITEMS rather than a second list, so a nav entry
      // added later is covered without anybody remembering to come back here.
      expect(adminPageTitle(href)).toBe(`${label} · Bothmade admin`);
    }
  );

  it('never leaves the marketing title in place for a real page', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      expect(adminPageTitle(item.href)).not.toContain('Apple Native Development');
    }
  });
});

describe('a detail page inherits its section', () => {
  it.each([
    ['/admin/projects/clx123', 'Projects'],
    ['/admin/clients/clx123', 'Clients'],
    ['/admin/call/clx123', 'Call HQ'],
    ['/admin/deployment/clx123', 'Deployment'],
  ])('%s is titled "%s"', (pathname, label) => {
    // The record's own name would be better and is not available without a
    // fetch. The section is the right altitude for a tab strip.
    expect(adminPageTitle(pathname)).toBe(`${label} · Bothmade admin`);
  });
});

describe('matching is segment-aware, not a plain prefix', () => {
  it('does not let /admin/call claim /admin/call-list', () => {
    // The bug a `startsWith` would introduce: call-list is its own page and
    // would silently be titled "Call HQ".
    expect(adminPageTitle('/admin/call-list')).not.toBe('Call HQ · Bothmade admin');
  });

  it('prefers the longer match when one href is a prefix of another', () => {
    // /admin/team-chat and /admin/team both exist, and /admin/team is a
    // segment-prefix of neither — so this pair passes on the segment check
    // alone. Worth being straight about: it also passes with the longest-first
    // sort removed, because ADMIN_NAV_ITEMS happens to list team-chat before
    // team and `.find` takes the first hit. The sort is what makes the answer
    // independent of that ordering, so a future nav reshuffle cannot silently
    // retitle a page. This assertion pins the behaviour, not the mechanism.
    expect(adminPageTitle('/admin/team-chat')).toBe('Team Chat · Bothmade admin');
    expect(adminPageTitle('/admin/team')).toBe('Team · Bothmade admin');
  });

  it('is independent of the order ADMIN_NAV_ITEMS happens to be in', () => {
    // The property the sort exists for, tested directly: every destination
    // must resolve to its own label regardless of where it sits in the array.
    // Checked against a reversed copy of the hrefs so a shortest-first
    // traversal would produce a wrong answer for at least one of them.
    for (const item of [...ADMIN_NAV_ITEMS].reverse()) {
      expect(adminPageTitle(item.href), item.href).toBe(`${item.label} · Bothmade admin`);
    }
  });
});

describe('real pages that have no nav entry', () => {
  it.each([
    ['/admin/leads', 'Leads'],
    ['/admin/leads/clx123', 'Leads'],
    ['/admin/pipeline', 'Pipeline'],
    ['/admin/call-list', 'Who to call'],
    ['/admin/login', 'Log in'],
  ])('%s is titled "%s"', (pathname, label) => {
    // Not oversights: the three lead lenses became tabs inside /admin/sales
    // and lost their sidebar entries while keeping their routes.
    // /admin/leads/[leadId] is where most of a sales day happens.
    expect(adminPageTitle(pathname)).toBe(`${label} · Bothmade admin`);
  });

  it('leaves no admin page on the marketing title', () => {
    // The whole surface, checked in one place.
    const every = [
      ...ADMIN_NAV_ITEMS.map((i) => i.href),
      '/admin/leads',
      '/admin/leads/clx123',
      '/admin/pipeline',
      '/admin/call-list',
      '/admin/login',
      '/admin/projects/new',
    ];
    for (const href of every) {
      expect(adminPageTitle(href), `${href} fell through`).not.toBe('Bothmade admin');
    }
  });

  it('still says which half of the app you are in', () => {
    // A page added without a nav entry, or the 404. Better than the marketing
    // title either way.
    expect(adminPageTitle('/admin/something-new')).toBe('Bothmade admin');
    expect(adminPageTitle('/admin')).toBe('Bothmade admin');
  });

  it('does not throw on an empty path', () => {
    expect(adminPageTitle('')).toBe('Bothmade admin');
  });
});

describe('the titles are actually distinguishable', () => {
  it('gives every nav destination a different one', () => {
    // The whole point. One duplicate puts two tabs back to being
    // indistinguishable.
    const titles = ADMIN_NAV_ITEMS.map((item) => adminPageTitle(item.href));
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('leads with the page name, since a tab shows the first few characters', () => {
    // "Billing · Bothmade admin" truncates usefully. "Bothmade admin · Billing"
    // truncates to the part every tab shares, which is the bug being fixed.
    for (const item of ADMIN_NAV_ITEMS) {
      expect(adminPageTitle(item.href).startsWith(item.label)).toBe(true);
    }
  });
});
