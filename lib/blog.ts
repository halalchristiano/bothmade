/**
 * Single source of truth for /blog and /blog/[slug].
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  EMPTY ON PURPOSE
 *
 *  No posts yet — the studio is new and there's nothing worth publishing
 *  under a fabricated byline. Add real entries here one at a time; the
 *  index and post template already render correctly with zero, one, or
 *  many posts.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A post's body is a list of typed blocks rather than raw markdown/MDX —
 * that's what lets each block carry its own bespoke animation (the whole
 * point of this template) instead of every post looking like the same
 * prose column with a different heading.
 */

export type Accent = 'sky' | 'indigo' | 'purple';

export type Block =
  /** A normal paragraph. First paragraph in a post gets a drop cap. */
  | { type: 'p'; text: string }
  /** A short mid-article thesis line — scrubs in word by word on scroll. */
  | { type: 'statement'; text: string }
  /** A large pull quote, optionally attributed. */
  | { type: 'quote'; text: string; attribution?: string }
  /** A row of numbers that count up into view — for real, sourced figures only. */
  | { type: 'stats'; items: { value: string; label: string }[] }
  /** A monospace code sample. */
  | { type: 'code'; code: string; language?: string }
  /** A section break with its own heading, restarting the reading rhythm. */
  | { type: 'heading'; text: string };

export type BlogPost = {
  slug: string;
  title: string;
  /** One line, shown on the index, the post hero, and used as meta description. */
  dek: string;
  tag: string;
  accent: Accent;
  /** ISO date, e.g. "2026-08-02". */
  date: string;
  /** Minutes, shown as "N min read". Keep honest — count the words. */
  readMinutes: number;
  body: Block[];
};

export const BLOG_POSTS: BlogPost[] = [];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getAdjacentBlogPosts(slug: string): { prev?: BlogPost; next?: BlogPost } {
  const sorted = [...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
  const idx = sorted.findIndex((p) => p.slug === slug);
  if (idx === -1) return {};
  return { prev: sorted[idx + 1], next: sorted[idx - 1] };
}

export function formatBlogDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
