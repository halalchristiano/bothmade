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
  | { type: 'heading'; text: string }
  /**
   * A live, scroll-driven demo embedded in the article itself — panels
   * stack over each other exactly like the sheet-presentation technique
   * described in the surrounding prose, scoped to a small local scroll
   * region rather than the full page. Show, don't just tell.
   */
  | { type: 'stackDemo'; panels: { label: string; from: string; to: string }[] };

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
  {
    slug: 'magnetic-buttons',
    title: 'A button that leans toward you',
    dek: "Making every call-to-action on the site pull toward the cursor, without touching anyone on a touchscreen.",
    tag: 'Engineering',
    accent: 'purple',
    date: '2026-09-06',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "Most of what separates a button that feels alive from one that just sits there is a few pixels of motion nobody consciously notices. Move the cursor near it and it drifts a little toward you; move away and it eases back. It reads as weight, like the button has physical presence, even though nothing about it changed shape. Every button on this site does that now — the trick is a small hook, not a library.",
      },
      {
        type: 'statement',
        text: "The hard part isn't the pull toward the cursor. It's making sure nothing happens at all on a phone.",
      },
      { type: 'heading', text: 'The mechanics' },
      {
        type: 'code',
        language: 'typescript',
        code: `function useMagnetic(reach = 70, pull = 0.35) {
  const x = useSpring(0, { stiffness: 300, damping: 20, mass: 0.5 });
  const y = useSpring(0, { stiffness: 300, damping: 20, mass: 0.5 });

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return; // touch devices: do nothing, ever

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < reach) { x.set(dx * pull); y.set(dy * pull); }
      else { x.set(0); y.set(0); }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [reach, pull]);

  return { x, y };
}`,
      },
      {
        type: 'p',
        text: 'Two spring-driven motion values, not raw state — that\'s what keeps it smooth. Setting x/y directly on every mousemove would fight the browser\'s paint cycle and feel jittery; a spring lets Framer Motion write straight to a CSS transform on the compositor thread every frame, so the button glides rather than snaps, and React never re-renders on mouse movement at all.',
      },
      { type: 'heading', text: 'The part that matters more than the effect' },
      {
        type: 'p',
        text: "The matchMedia check at the top isn't a nice-to-have — it's the reason this is safe to ship. hover: hover and pointer: fine both have to be true before a single listener attaches. No fine pointer, no hover capability, nothing runs: no wasted event listeners on mobile, no phantom offset that never resets because there was never a mouseleave to fire it. The effect only exists for the input device it makes sense on.",
      },
      {
        type: 'p',
        text: "It also gets out of the way for anyone who's told their OS they don't want motion — a useReducedMotion() check inside the same hook bails before any listener is ever attached. A detail like this should be additive polish, never a tax on someone who explicitly opted out of it.",
      },
    ],
  },
  {
    slug: 'text-that-develops-like-film',
    title: 'Text that develops like film',
    dek: "The scroll-scrubbed paragraph on our homepage, and why it's driven by scroll position instead of time.",
    tag: 'Engineering',
    accent: 'sky',
    date: '2026-09-13',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: "The easy version of a text reveal fades a paragraph in once, on a timer, the moment it enters the viewport. It looks fine the first time and wrong every time after — scroll back up past it and the words are just sitting there, already finished, because a setTimeout doesn't know or care where your scroll position actually is. We wanted something that replays correctly no matter which direction you're moving.",
      },
      {
        type: 'statement',
        text: "Keyed to scroll position instead of a clock, scrubbing up and down replays the reveal like rewinding film.",
      },
      { type: 'heading', text: 'One motion value per word' },
      {
        type: 'code',
        language: 'typescript',
        code: `const { scrollYProgress } = useScroll({
  target: ref,
  offset: ['start 0.9', 'start 0.35'],
});

const words = text.split(' ');
// each word gets its own slice of the 0→1 scroll range
words.map((word, i) => (
  <ScrubWord
    word={word}
    progress={scrollYProgress}
    range={[i / words.length, (i + 1) / words.length]}
  />
));`,
      },
      {
        type: 'p',
        text: "Each word is handed the same scroll-position value but a different slice of it to react to — word one finishes sharpening well before word ten even starts. useTransform maps that slice onto opacity, a small blur, and a few pixels of upward drift, so the sentence reads as focusing into clarity rather than just fading in. Because it's all derived from scrollYProgress and nothing else, scrolling back up runs the whole thing in reverse for free — there's no separate 'exit' animation to write.",
      },
      { type: 'heading', text: 'The one branch that matters' },
      {
        type: 'p',
        text: "None of this runs for anyone with reduced motion turned on. The component checks useReducedMotion() once and, if it's set, renders the words as plain static text with none of the motion wiring attached — not just skipped visually, actually never subscribed to scroll events in the first place. An animation nobody asked for is a worse experience than no animation at all.",
      },
    ],
  },
  {
    slug: 'vision-pro-is-not-a-stretched-ipad',
    title: "Vision Pro isn't a stretched iPad",
    dek: "Windows, volumes, and immersive spaces aren't three sizes of the same screen — they're three different design problems.",
    tag: 'Design',
    accent: 'indigo',
    date: '2026-09-20',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "The fastest way to ship something on Vision Pro that feels wrong is to take an iPad layout, drop it in a floating window, and call it done. It'll compile. It'll even look reasonable in a screenshot. Then someone actually wears the headset, and the flat rectangle full of dense list items sitting in physical space just feels like a monitor that followed you home — because it is one. Nothing about the interface acknowledges that it now has depth to work with, or that the user's whole living room is part of the canvas.",
      },
      {
        type: 'statement',
        text: 'visionOS gives you three fundamentally different containers, and reaching for the wrong one is the most common mistake we see.',
      },
      { type: 'heading', text: 'Windows' },
      {
        type: 'p',
        text: "A window is the closest thing to familiar ground — flat SwiftUI content floating in space, and mostly the right call for anything text- or list-heavy: settings, a document, an inbox. The mistake isn't using a window, it's stopping there for everything. Windows are the default because they're the least effort to build, not because they're the best fit for every screen in the app.",
      },
      { type: 'heading', text: 'Volumes' },
      {
        type: 'p',
        text: "A volume gives content actual three-dimensional bounds — you can walk around it. This is where a lot of apps quietly fail: they put a 3D model in a volume and never ask what the user gains from walking around it that they didn't already have from rotating it with a drag gesture in a window. A volume earns its cost when depth adds information — an architectural model, a product you're actually inspecting — not when it's used because volumes feel more 'spatial.'",
      },
      { type: 'heading', text: 'Immersive spaces' },
      {
        type: 'p',
        text: "Full immersion replaces the user's surroundings, partially or entirely. It's the most powerful container and the easiest to misuse, because taking over someone's entire visual field is a big ask for a feature that doesn't need it. We treat immersive space as something the user opts into for a specific reason — a fully spatial experience the app is actually about — not a wrapper around content that would work fine in a window.",
      },
      { type: 'heading', text: 'The actual rule' },
      {
        type: 'p',
        text: "Pick the container based on what the content needs, not on what looks most impressive in a keynote. Most of an app's screens are still windows. That's not a failure to use the platform — using restraint on a platform this new is usually the harder, better decision.",
      },
    ],
  },
  {
    slug: 'four-worlds-one-scrollbar',
    title: 'Four worlds, one scrollbar',
    dek: 'How the homepage presents Web, iOS, macOS, and Vision Pro as physical sheets stacking on top of each other — try it below.',
    tag: 'Engineering',
    accent: 'indigo',
    date: '2026-09-27',
    readMinutes: 5,
    body: [
      {
        type: 'p',
        text: "Our homepage has a section that doesn't scroll like the rest of the page. Instead of content sliding past, four full-screen panels — Web, iOS, macOS, Vision Pro — rise up and dock into place one after another, each one burying the last slightly into the background, the way an iOS sheet slides up over whatever was on screen before it. It's not a slideshow and it's not a carousel. It's four sheets of glass, physically stacking, and your scrollbar is the only thing moving them.",
      },
      {
        type: 'statement',
        text: "The section is pinned in place for five screen-heights of scrolling, and everything you see is just one number — scroll progress — mapped onto four sheets at once.",
      },
      { type: 'heading', text: 'Try it' },
      {
        type: 'stackDemo',
        panels: [
          { label: 'Web', from: '#0ea5e9', to: '#0c2f52' },
          { label: 'iOS', from: '#6366f1', to: '#1e1b4b' },
          { label: 'macOS', from: '#a855f7', to: '#3b0764' },
          { label: 'Vision Pro', from: '#f0abfc', to: '#818cf8' },
        ],
      },
      {
        type: 'p',
        text: "That's a scaled-down version of exactly the same code driving the real section — same math, same easing, same four-panel idea, just a smaller pinned region. Scrolling through it doesn't play a video or trigger a sequence of separate animations; every panel's position and depth-dimming is a pure function of one scrollYProgress value, read fresh on every frame.",
      },
      { type: 'heading', text: 'The trick is a pinned container' },
      {
        type: 'p',
        text: "The section wrapper is five screen-heights tall, but position: sticky holds its inner content pinned to the top of the viewport for the entire time you're scrolling through that height. From the outside it looks like the page stopped scrolling and something else took over — really, the page never stopped; the tall wrapper is just giving the sticky content somewhere to stay pinned while five screens' worth of scroll distance quietly pass underneath it.",
      },
      {
        type: 'code',
        language: 'tsx',
        code: `<section className="relative h-[500vh]">
  <div className="sticky top-0 h-screen overflow-hidden">
    {/* every panel lives here, position is derived, not stepped */}
  </div>
</section>`,
      },
      { type: 'heading', text: 'One progress value, four interpretations' },
      {
        type: 'p',
        text: "Each panel gets handed the exact same scrollYProgress and asks a different question of it: am I in my arrival window, my resting window, or my burial window? A panel arriving translates from 104% down to 0% — fully offscreen below to fully docked. A panel already resting just sits at 0% doing nothing, which is why the section feels calm instead of constantly busy. And a panel about to be buried by the next one scales down a touch and dims, so depth reads as a physical stack rather than a cut.",
      },
      {
        type: 'p',
        text: "None of the four panels animate on a timer, and none of them know what the others are doing — they all just react independently to the same shared number. That's what makes scrolling backward feel correct instantly, with no special-case code for reverse: run the same math with a smaller progress value and the whole stack unwinds exactly as it built.",
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
