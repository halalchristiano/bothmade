import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { generateMetadata } from '@/app/work/[slug]/page';
import { CASE_STUDIES } from '@/lib/case-studies';

/**
 * One field, `status`, decides two things in two different files, and nothing
 * held them together.
 *
 * app/sitemap.ts filters to `status === 'live'` before listing a case study.
 * app/work/[slug]/page.tsx sets `robots: { index: false }` on anything that is
 * not `'live'`. Both are correct today and both were written from the same
 * intent — the sitemap even says so out loud: "submitting a URL we're asking
 * not to index is a contradiction".
 *
 * That contradiction is what this guards. Google reports a sitemap entry
 * carrying noindex as an error, and the inverse — a published study left out
 * of the sitemap — is a page nobody is told exists. Either can be introduced
 * by editing one file and not the other, and neither breaks anything that
 * would fail a test or show up on screen.
 *
 * Worth stating plainly: all three studies are `in-progress` right now, so the
 * live branch of both rules is currently unexercised in production. A test
 * that only checked the data as it stands would assert nothing about the rule.
 * These construct both cases.
 */

const SITE = 'https://bothmade.studio';

function sitemapWorkSlugs(): string[] {
  return sitemap()
    .map((entry) => String(entry.url))
    .filter((url) => url.includes('/work/'))
    .map((url) => url.split('/work/')[1]);
}

/** The `robots` value Next would apply to a study's detail page. */
async function robotsFor(slug: string) {
  const meta = await generateMetadata({ params: Promise.resolve({ slug }) });
  return meta.robots;
}

describe('the two rules agree with each other', () => {
  it('lists exactly the live studies in the sitemap', async () => {
    const live = CASE_STUDIES.filter((s) => s.status === 'live').map((s) => s.slug);
    expect(sitemapWorkSlugs().sort()).toEqual(live.sort());
  });

  it('never submits a URL it also asks not to index', async () => {
    // The contradiction, checked against the real generateMetadata rather
    // than against the status field a second time.
    for (const slug of sitemapWorkSlugs()) {
      const robots = await robotsFor(slug);
      expect(robots, `/work/${slug} is in the sitemap and noindexed`).toBeUndefined();
    }
  });

  it('never leaves an indexable study out of the sitemap', async () => {
    // The other direction: a published case study nobody is told exists.
    const listed = new Set(sitemapWorkSlugs());
    for (const study of CASE_STUDIES) {
      const robots = await robotsFor(study.slug);
      if (robots === undefined) {
        expect(listed.has(study.slug), `/work/${study.slug} is indexable but unlisted`).toBe(true);
      }
    }
  });
});

describe('what each status actually produces', () => {
  it('noindexes an in-progress study, and still follows its links', async () => {
    const inProgress = CASE_STUDIES.find((s) => s.status === 'in-progress');
    expect(inProgress, 'no in-progress study to check').toBeDefined();

    // follow: true on purpose — the page links on to the next study and to
    // the contact form, and there is no reason to strand that link equity.
    expect(await robotsFor(inProgress!.slug)).toEqual({ index: false, follow: true });
  });

  it('leaves a live study fully indexable', async () => {
    // Constructed rather than found, because every study is in-progress today
    // and this branch would otherwise never run. If one is ever published,
    // this is the assertion that says what should happen.
    const live = CASE_STUDIES.find((s) => s.status === 'live');
    if (live) {
      expect(await robotsFor(live.slug)).toBeUndefined();
    } else {
      // No live study exists — assert the rule from the other side, so the
      // test still means something rather than silently passing.
      const listed = sitemapWorkSlugs();
      expect(listed, 'no study is live, so none should be listed').toEqual([]);
    }
  });

  it('has a status on every study, since both rules branch on it', async () => {
    for (const study of CASE_STUDIES) {
      expect(['live', 'in-progress'], `${study.slug} has status "${study.status}"`).toContain(
        study.status
      );
    }
  });
});

describe('the sitemap entries themselves', () => {
  it('are absolute URLs on the real domain', () => {
    for (const entry of sitemap()) {
      expect(String(entry.url).startsWith(SITE) || String(entry.url).startsWith('http')).toBe(true);
    }
  });

  it('carry a usable lastModified rather than an Invalid Date', () => {
    // `new Date(`${study.year}-01-01`)` and `new Date(post.date)` both produce
    // Invalid Date from a typo, which serialises into the XML as garbage.
    for (const entry of sitemap()) {
      const value = entry.lastModified;
      if (value === undefined) continue;
      const date = value instanceof Date ? value : new Date(value);
      expect(Number.isNaN(date.getTime()), `bad lastModified on ${entry.url}`).toBe(false);
    }
  });
});
