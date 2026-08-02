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

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'one-team-every-surface',
    title: 'One team, every surface',
    dek: 'Why the same two people write the website and the iOS app, and what that actually costs us.',
    tag: 'Process',
    accent: 'indigo',
    date: '2026-08-02',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: 'Most software gets built by two teams that never talk. One ships the website, the other ships the app, and the seam between them shows up as the thing users notice first — a feature that exists on one platform and not the other, copy that drifted apart after the first rewrite, a login flow that behaves differently depending on where you tapped it from. Nobody planned that inconsistency. It is just what happens when two separate groups own two separate halves of one product.',
      },
      {
        type: 'statement',
        text: 'We avoid that seam by never creating it — the person who writes your API is the same person who consumes it in Swift.',
      },
      { type: 'heading', text: 'What one team actually buys' },
      {
        type: 'p',
        text: "It is not that we are twice as productive as two specialized teams — we are not. It is that a decision made for the web side is felt immediately on the native side, by the same person, in the same day, instead of being relayed through a meeting, a ticket, and a Slack thread that loses context on the way. When we change how a resource is shaped in the backend, the TypeScript types and the Swift models get updated in the same sitting, because nothing is waiting on someone else's sprint.",
      },
      {
        type: 'code',
        language: 'typescript',
        code: `// One shape, defined once, consumed twice.
export type Project = {
  id: string;
  title: string;
  status: 'draft' | 'active' | 'shipped';
  updatedAt: string; // ISO 8601
};

// The Swift side mirrors this by hand today — same fields,
// same order, reviewed in the same PR as the TS change.
// struct Project: Codable {
//   let id: String
//   let title: String
//   let status: Status
//   let updatedAt: String
// }`,
      },
      {
        type: 'p',
        text: "That mirroring is manual right now, which is deliberate — we would rather feel the friction of keeping two type systems in sync by hand than hide it behind a code generator we don't fully trust yet. The friction is a signal. If it starts to hurt, that's the point at which generating the Swift models from the TypeScript source earns its complexity. It hasn't yet.",
      },
      { type: 'heading', text: 'What it costs' },
      {
        type: 'p',
        text: "The honest tradeoff is capacity. A two-person studio that does both surfaces will always ship fewer total projects at once than two separate specialist shops running in parallel. We are not the fastest option if you need five features shipped simultaneously across a large team. What we are is the option where nothing gets lost in the handoff, because there is no handoff — just the same two people, moving from one file to the other.",
      },
    ],
  },
];

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
