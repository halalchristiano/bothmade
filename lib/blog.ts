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
  {
    slug: 'fixed-scope-fixed-price',
    title: 'Fixed scope, fixed price',
    dek: 'Why we quote a number before we write a line of code, and what has to be true for that to work.',
    tag: 'Process',
    accent: 'sky',
    date: '2026-08-09',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "Hourly billing sounds fair until you're the one paying it. The incentive runs backwards: the studio gets paid more the longer the project takes, and you find out what something actually cost only after it's already been built. We quote a fixed number for a fixed scope before we start, because the alternative asks you to trust a stranger's time sheet instead of trusting a specific, written description of what you're getting.",
      },
      {
        type: 'statement',
        text: 'The price only moves if the scope moves — and the scope is a document, not a feeling.',
      },
      { type: 'heading', text: 'What has to happen first' },
      {
        type: 'p',
        text: "A fixed price is only honest if the scoping was thorough. We spend real time before quoting anything — what screens exist, what the data model looks like, which parts are genuinely uncertain versus just undecided. If we can't scope something with confidence (a novel technical risk, an integration we've never touched), we say so and price that piece separately as a short, capped discovery phase, rather than quietly padding the main number to cover our own uncertainty.",
      },
      { type: 'heading', text: 'What happens when you want more' },
      {
        type: 'p',
        text: "Scope changes on almost every real project — that's normal, not a failure of planning. When it happens, we price the addition on its own, you approve it before we start, and the original number never quietly grows to absorb it. You always know, at any point, exactly what the current total is and why.",
      },
      {
        type: 'p',
        text: "The tradeoff is on us, not you. If we underestimate something inside the agreed scope, that's our error to absorb, not a renegotiation. Fixed price only means something if it's actually fixed on the side that got it wrong.",
      },
    ],
  },
  {
    slug: 'no-account-manager',
    title: "There's no account manager",
    dek: "Why every message you send reaches whoever is actually writing the code — and what that means when something goes wrong.",
    tag: 'Process',
    accent: 'purple',
    date: '2026-08-16',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: "Most studios put a person between you and the work — someone whose job is to relay your notes to a team you never talk to directly. It's not malicious; it's how you staff a large org without every client pinging every engineer. But it has a cost you pay on every single request: a question gets summarized before it reaches the person who can actually answer it, and the answer gets summarized again on the way back. Nuance dies in both directions.",
      },
      {
        type: 'statement',
        text: "When you write to us, you're writing to the person who will open the file five minutes later.",
      },
      { type: 'heading', text: 'What this is not' },
      {
        type: 'p',
        text: "This isn't a promise of instant replies at all hours — we're two people, not a support desk. It's a promise that there is no lossy hop in between. If a request is ambiguous, the person building it asks you directly, in the moment they hit the ambiguity, instead of guessing and finding out three weeks later in a review call that it wasn't what you meant.",
      },
      { type: 'heading', text: "The failure mode we're avoiding" },
      {
        type: 'p',
        text: "The account-manager model fails quietly. Nobody lies to you — the manager genuinely believes they relayed your feedback accurately, and the engineer genuinely believes they built what was described to them. The gap only becomes visible once the wrong thing ships. Direct access doesn't make us better listeners than anyone else. It just removes the step where a good-faith summary can drift from what you actually said.",
      },
    ],
  },
  {
    slug: 'built-to-last',
    title: 'Built to last',
    dek: "Why we default to boring, well-worn tools instead of whatever launched on Twitter last week — and the one time we don't.",
    tag: 'Process',
    accent: 'indigo',
    date: '2026-08-23',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "A new framework shows up every few months promising to make everything faster, simpler, more elegant. Some of them are genuinely good ideas. Almost none of them have been run in production long enough for anyone to know what breaks at year two — the upgrade path nobody wrote, the plugin ecosystem that quietly stopped maintaining itself, the one maintainer who moved on. You don't find that out by reading the launch post. You find out by being the client stuck migrating off it.",
      },
      {
        type: 'statement',
        text: "We'd rather you own something boring for ten years than something exciting for two.",
      },
      { type: 'heading', text: 'What "boring" means here' },
      {
        type: 'code',
        language: 'text',
        code: `Default stack, chosen for longevity over novelty:

  Web       Next.js, TypeScript, Postgres
  iOS       Swift, SwiftUI
  Backend   Prisma, plain REST — no bespoke query layer
  Hosting   Vercel / standard cloud, nothing exotic to operate`,
      },
      {
        type: 'p',
        text: "None of this is a hot take. That's the point. Every piece has a large community, a multi-year track record, and — crucially — more than one company you could hire if you ever needed to move off us. A product built on a tool only we understand isn't really yours; it's ours, and you're renting it. Boring, popular tools mean you could hand this codebase to a different developer next year and they'd recognize everything in it by lunchtime.",
      },
      { type: 'heading', text: 'When we break the rule' },
      {
        type: 'p',
        text: "We'll reach for something newer when the boring option genuinely can't do the job — not because the new thing is interesting, but because there's no mature alternative yet. When that happens, we say so explicitly before you're committed to it, and we explain what the risk actually is, rather than quietly picking the fun tool and letting you find out later.",
      },
    ],
  },
  {
    slug: 'no-captcha-on-our-contact-form',
    title: "Why our contact form doesn't have a CAPTCHA",
    dek: "The honeypot field we actually ship instead — invisible to you, irresistible to a bot.",
    tag: 'Engineering',
    accent: 'sky',
    date: '2026-08-30',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "CAPTCHAs exist to answer one question — is a human filling out this form — and they answer it by making humans prove it, which is backwards. You get a puzzle, a delay, sometimes a third-party script loaded from someone else's server before you're even allowed to say hello. Most of that friction lands entirely on real visitors, because the bots it's meant to stop have gotten good at solving image grids. We wanted the spam filtered without asking a single real person to do anything at all.",
      },
      {
        type: 'statement',
        text: 'A honeypot field asks the bot to prove it’s a bot, instead of asking you to prove you’re not one.',
      },
      { type: 'heading', text: 'How it actually works' },
      {
        type: 'p',
        text: 'The trick is one extra input field, hidden from sighted users with CSS and pulled out of the tab order so keyboard and screen-reader users never even land on it. A human filling out the form the normal way never sees it and never touches it. A bot scraping the page for form fields — which is most of them — has no way to know it’s not supposed to fill this one in, because it looks identical to every other input in the markup.',
      },
      {
        type: 'code',
        language: 'tsx',
        code: `{/* Hidden from sighted users and screen readers alike, and
    skipped by tab order — only a bot filling every field
    will trip it. */}
<div aria-hidden="true" className="absolute w-px h-px -left-[9999px] overflow-hidden">
  <label htmlFor="website">Leave this field empty</label>
  <input
    id="website"
    name="website"
    type="text"
    tabIndex={-1}
    autoComplete="off"
    value={formData.website}
    onChange={handleChange}
  />
</div>`,
      },
      {
        type: 'p',
        text: "On submit, the server checks that field. Empty means a human filled this out the way it was intended. Anything in it means whatever submitted the form was filling in every input it could find, which no real visitor does — so we drop the submission silently and never bother you with a false 'we received your message.'",
      },
      { type: 'heading', text: 'What this costs' },
      {
        type: 'p',
        text: "It won't stop a bot built specifically to target this one form, the way a CAPTCHA arguably tries to. It stops the generic spam scripts that account for the overwhelming majority of junk submissions, at zero cost to anyone actually trying to reach us. For a contact form on a studio site, that's the right trade — we'd rather block 95% of the noise for free than block 100% of it by taxing every real visitor to prove their humanity.",
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
