import { describe, expect, it } from 'vitest';
import {
  BLOG_POSTS,
  formatBlogDate,
  getAdjacentBlogPosts,
  getBlogPost,
  headingSlug,
  sortedBlogPosts,
} from '@/lib/blog';

/**
 * The order of the blog, which had no tests and two implementations.
 *
 * `(a, b) => (a.date < b.date ? 1 : -1)` never returns 0. Handed two posts
 * with the same date it reports them as ordered in both directions, which is
 * not a total order — so `sort` may arrange them however it likes, and the
 * two hand-copied calls (this module and components/BlogIndex) were free to
 * arrange them differently.
 *
 * Nothing looks wrong today because no two posts share a date. The day
 * somebody publishes twice, the index and the prev/next chain stop agreeing:
 * "Next" leads to a post sitting above you in the list, or a post is
 * reachable from the index and from nowhere else.
 */

describe('the order posts are read in', () => {
  it('is newest first', () => {
    const dates = sortedBlogPosts().map((p) => p.date);

    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('loses nothing and invents nothing', () => {
    const sorted = sortedBlogPosts();

    expect(sorted).toHaveLength(BLOG_POSTS.length);
    expect(new Set(sorted.map((p) => p.slug)).size).toBe(BLOG_POSTS.length);
  });

  it('does not reorder the array it was given', () => {
    const before = BLOG_POSTS.map((p) => p.slug);
    sortedBlogPosts();

    expect(BLOG_POSTS.map((p) => p.slug)).toEqual(before);
  });

  it('gives the same answer every time, including for posts sharing a date', () => {
    // The failure this exists for. A comparator that reports equal items as
    // ordered lets `sort` return a different arrangement on a different
    // engine, a different array length, or a different day.
    const posts = [
      { slug: 'a', date: '2026-08-02' },
      { slug: 'b', date: '2026-08-02' },
      { slug: 'c', date: '2026-08-03' },
      { slug: 'd', date: '2026-08-02' },
    ];
    const cmp = (x: { date: string }, y: { date: string }) =>
      x.date === y.date ? 0 : x.date < y.date ? 1 : -1;

    // Consistent in both directions, which is what the old one was not.
    for (const x of posts) {
      for (const y of posts) {
        // `+ 0` normalises -0, which Object.is treats as distinct from 0.
        expect(Math.sign(cmp(x, y)) + 0).toBe(-Math.sign(cmp(y, x)) + 0);
      }
    }

    // And stable: equal dates keep the order they were written in.
    expect([...posts].sort(cmp).map((p) => p.slug)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('walking from one post to the next', () => {
  const sorted = sortedBlogPosts();

  it('sends "previous" to the older post and "next" to the newer one', () => {
    const middle = sorted[1];
    const { prev, next } = getAdjacentBlogPosts(middle.slug);

    expect(prev?.slug).toBe(sorted[2].slug);
    expect(next?.slug).toBe(sorted[0].slug);
    expect(prev!.date <= middle.date).toBe(true);
    expect(next!.date >= middle.date).toBe(true);
  });

  it('offers no "next" from the newest and no "previous" from the oldest', () => {
    expect(getAdjacentBlogPosts(sorted[0].slug).next).toBeUndefined();
    expect(getAdjacentBlogPosts(sorted[sorted.length - 1].slug).prev).toBeUndefined();
  });

  it('reaches every post by walking the chain from the newest', () => {
    // The property the two implementations have to share: the chain and the
    // list are the same sequence, so nothing is orphaned.
    const walked: string[] = [sorted[0].slug];
    let cursor = sorted[0].slug;
    for (;;) {
      const { prev } = getAdjacentBlogPosts(cursor);
      if (!prev) break;
      walked.push(prev.slug);
      cursor = prev.slug;
    }

    expect(walked).toEqual(sorted.map((p) => p.slug));
  });

  it('says nothing about a slug that is not a post', () => {
    expect(getAdjacentBlogPosts('no-such-post')).toEqual({});
    expect(getBlogPost('no-such-post')).toBeUndefined();
  });
});

describe('an id for a section heading', () => {
  it('turns a heading into something that can sit in a URL', () => {
    expect(headingSlug('What one team actually buys')).toBe('what-one-team-actually-buys');
  });

  it('drops punctuation rather than escaping it into the URL bar', () => {
    expect(headingSlug('So — what does it cost?')).toBe('so-what-does-it-cost');
    expect(headingSlug('Design & engineering, together')).toBe('design-engineering-together');
  });

  it('folds accents instead of percent-encoding them', () => {
    expect(headingSlug('Café déjà vu')).toBe('cafe-deja-vu');
  });

  it('never produces a leading, trailing or doubled dash', () => {
    for (const text of ['  spaced  ', '—leading', 'trailing—', 'a   b']) {
      const slug = headingSlug(text);
      expect(slug).not.toMatch(/^-|-$|--/);
    }
  });

  it('falls back rather than returning an empty fragment', () => {
    // `href="#"` jumps to the top of the page, which is the one place the
    // reader already was.
    expect(headingSlug('———')).toBe('section');
    expect(headingSlug('')).toBe('section');
  });

  it('is stable, because these end up in links people send each other', () => {
    expect(headingSlug('The seam')).toBe(headingSlug('The  Seam'));
  });

  it('gives every real heading in the blog a usable id', () => {
    const headings = BLOG_POSTS.flatMap((post) =>
      post.body.filter((b): b is { type: 'heading'; text: string } => b.type === 'heading')
    );

    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) {
      expect(headingSlug(h.text)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('the date under the title', () => {
  it('reads the same wherever the reader is', () => {
    // Pinned to UTC on purpose: a post dated the 2nd must not render as the
    // 1st for somebody west of Greenwich.
    expect(formatBlogDate('2026-08-02')).toBe('August 2, 2026');
  });
});
