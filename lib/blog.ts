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
  | { type: 'stackDemo'; panels: { label: string; from: string; to: string }[] }
  /**
   * A miniature, actually-draggable version of the homepage hero's split
   * seam — two labelled worlds clipped against each other, dragged by a
   * spring-driven handle. Same clip-path + spring technique, small scale.
   */
  | {
      type: 'seamDemo';
      leftLabel: string;
      rightLabel: string;
      leftColor: string;
      rightColor: string;
    }
  /**
   * A miniature, actually-hoverable version of the footer's letter-flip
   * wordmark — hover or tap a letter and it flips to the other world's
   * treatment, then springs back after a beat.
   */
  | { type: 'letterFlipDemo'; word: string }
  /**
   * A miniature, self-contained replay of the site's custom cursor + easing
   * trail, scoped to a small box instead of the whole viewport.
   */
  | { type: 'cursorDemo' }
  /**
   * A bounded scroll box with its own progress bar tracking scroll through
   * that box specifically — same technique as the global ScrollProgress
   * bar, driven by useScroll({ container }) instead of the page.
   */
  | { type: 'scrollProgressDemo' }
  /**
   * A short stack of rows using the real FocusRow primitive, so scrolling
   * this exact section of the article demonstrates the reading-line focus
   * effect on itself.
   */
  | { type: 'focusListDemo'; items: string[] }
  /**
   * A bounded box with its own vertical seam line growing top-to-bottom as
   * you scroll it — same technique as the site-wide ScrollSeamIndicator,
   * scoped locally via useScroll({ container }).
   */
  | { type: 'seamIndicatorDemo' }
  /**
   * A replayable, scoped version of the homepage's first-visit splash
   * intro — the seam-line-expands-into-light timeline — with a button to
   * trigger it again instead of the real one-per-session gate.
   */
  | { type: 'introDemo' }
  /**
   * Side-by-side scroll boxes — one native, one with a simulated scroll
   * hijack (delayed, eased response to wheel input) — so the difference
   * described in the surrounding prose can actually be felt, not just read.
   */
  | { type: 'scrollCompareDemo' }
  /**
   * Scaled replay of ProcessTimeline: a few phase cards that fade/slide in
   * via whileInView (replaying every time they re-enter the viewport) plus
   * a separately scroll-derived progress bar underneath.
   */
  | { type: 'processDemo'; phases: { num: string; title: string; tag: string }[] }
  /**
   * Scaled replay of ServicePage's stack-chip grid — a two-axis stagger
   * (column delay + per-chip delay combined into one formula) plus a
   * hover lift on each chip.
   */
  | { type: 'stackChipsDemo'; columns: { heading: string; items: string[] }[] }
  /**
   * A live, real pricing demo — reads BASE_SERVICES directly from
   * lib/pricing.ts (the same data driving /start and Stripe checkout), so
   * these figures can never drift out of sync with the real pricing page.
   */
  | { type: 'pricingDemo' }
  /**
   * A scaled replay of the iOS page's Springboard: tap an icon and a panel
   * expands from that exact icon's measured position to fill the demo
   * container — the same rect-measurement + AnimatePresence technique as
   * the real app-launch transition, bounded to a small stage.
   */
  | { type: 'springboardDemo' }
  /**
   * A miniature replay of WebHero's KineticWord: letters morph
   * font-variation-settings weight and color based on proximity to the
   * pointer, with an idle sine-wave breathing fallback when the pointer
   * has been still for a while.
   */
  | { type: 'kineticWordDemo'; word: string }
  /**
   * Scaled replay of WebHero's scroll-driven fly-through sequence: words
   * scale up ~9x and fade as you scroll past each one's slot, so scrolling
   * reads as flying through one word into the next.
   */
  | { type: 'flyThroughDemo'; words: string[] }
  /**
   * Scaled replay of VisionHero's pointer-driven 3D depth scene: a
   * transform-style: preserve-3d container whose rotateX/rotateY track
   * pointer position, with child elements at different translateZ depths
   * so the whole scene tilts as one rigid diorama.
   */
  | { type: 'parallaxDemo' }
  /** A staggered milestone timeline — launch, month 1, month 3, ongoing — each dot arriving in sequence with a connecting line drawing behind it. */
  | { type: 'supportTimelineDemo'; milestones: { label: string; desc: string }[] }
  /** A toggle switch flips the exact same animated element between full motion and its prefers-reduced-motion fallback, side by side. */
  | { type: 'reducedMotionToggleDemo' }
  /** A text input replaces WebHero's fixed word — type anything and it gets the cursor-reactive kinetic-weight treatment live. */
  | { type: 'kineticPlaygroundDemo' }
  /** Live add-on checklist reading real ADD_ON_REQUIRES/expandAddOnDependencies from lib/pricing.ts — check one, watch its silent dependency auto-add. */
  | { type: 'dependencyDemo' }
  /** A scaled replay of Nav's mobile overlay: hamburger-to-X morph, staggered link entrance, scroll lock, Escape to close — in a bounded stage instead of the real viewport. */
  | { type: 'mobileMenuDemo' }
  /** Side by side: a stock-photo-style placeholder vs. the site's actual dashed "honest empty frame." */
  | { type: 'honestFrameDemo' }
  /** Pick a real business problem, see the real problem/costsThem framing and which add-ons actually fix it — from PAIN_POINT_BRIEFS in lib/pricing.ts. */
  | { type: 'diagnosisDemo' }
  /** Toggle between an unwrapped batch write (partial failure leaves a mess) and one wrapped in a transaction (all-or-nothing). */
  | { type: 'transactionDemo' }
  /** A tiny live preview of the site's actual 404 treatment — type any fake path and see it render. */
  | { type: 'notFoundDemo' };

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
  {
    slug: 'the-seam-is-the-whole-idea',
    title: 'The seam is the whole idea',
    dek: "The draggable line down the middle of our homepage isn't decoration — it's the entire pitch, made touchable. Drag it below.",
    tag: 'Engineering',
    accent: 'purple',
    date: '2026-10-04',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "Bothmade means both made — web and native, made by the same team. We could have said that in a sentence and moved on. Instead the homepage hero is a single line you can physically drag: pull it right and you're looking at the web world, pull it left and you're in the native one, and the wordmark itself morphs letter by letter as the line crosses it. The name of the studio is a description of what the interaction does.",
      },
      {
        type: 'statement',
        text: "It's not an animation that plays. It's a value you control, with your hand, that everything else on screen reacts to.",
      },
      { type: 'heading', text: 'Drag it' },
      {
        type: 'seamDemo',
        leftLabel: 'Web',
        rightLabel: 'Native',
        leftColor: '#0c2f52',
        rightColor: '#1e1b4b',
      },
      {
        type: 'p',
        text: "That's the actual mechanic from the homepage, scaled down: a target position, a spring that chases it, and a CSS clip-path that reveals the left world up to wherever the spring currently sits. Nothing about the two worlds underneath ever moves — only the boundary between them does, and everything downstream (the label opacity, the wordmark treatment) reads its position off that one number.",
      },
      { type: 'heading', text: 'Why a spring and not the raw pointer position' },
      {
        type: 'code',
        language: 'typescript',
        code: `const target = useMotionValue(50);           // where you're dragging to
const seam = useSpring(target, {              // where the line actually is
  stiffness: 340,
  damping: 34,
  mass: 0.6,
});

const clipPath = useMotionTemplate\`inset(0 \${
  useTransform(seam, (v) => 100 - v)
}% 0 0)\`;`,
      },
      {
        type: 'p',
        text: "Setting the clip-path straight from the pointer's x-coordinate would work, but it would feel like dragging a window shade — dead, mechanical, exactly as fast as your hand and no faster or slower. Routing the pointer through a spring instead gives the line weight: it chases your finger with a slight, physical lag, and when you let go it settles rather than stopping dead. That half-second of settling is doing almost all of the emotional work — it's the difference between moving a slider and pushing a real object.",
      },
      { type: 'heading', text: 'It has to work without a mouse' },
      {
        type: 'p',
        text: "A drag-only interaction that's also the site's primary way of expressing what the studio does can't be mouse-exclusive — that would hide the entire pitch from keyboard and switch-control users. The real handle carries role=\"slider\" with aria-valuenow, aria-valuemin, and aria-valuemax, and left/right arrow keys nudge the same target value the pointer drags. Screen readers announce it as what it structurally is — a slider — not as a mystery line in the middle of the screen.",
      },
    ],
  },
  {
    slug: 'a-wordmark-that-plays-along',
    title: 'A wordmark that plays along',
    dek: "Every letter of our logo secretly knows which half of the name it belongs to. Hover one below and watch it switch sides.",
    tag: 'Engineering',
    accent: 'purple',
    date: '2026-10-11',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: "Every page on the site ends the same way: the wordmark BOTHMADE sitting in the footer, half rendered as a sky-blue wireframe outline, half as a solid violet gradient — split exactly down the middle, BOTH from the web world and MADE from the native one. It would be a fine static logo left alone. Instead every single letter is listening for your cursor, and touching one flips it to the opposite treatment for a little over a second before it settles back.",
      },
      {
        type: 'statement',
        text: "Nobody is told to touch it. The letters just happen to react, and that's what makes people keep trying more of them.",
      },
      { type: 'heading', text: 'Try it' },
      { type: 'letterFlipDemo', word: 'BOTHMADE' },
      {
        type: 'p',
        text: "Under the hood it's one boolean per letter and a Map of timeouts, nothing more exotic than that. Hovering a letter flips its boolean to true and starts a 1200ms timer; hovering it again before the timer fires clears the old timeout and starts a fresh one, so quickly re-triggering a letter never causes it to flicker back early. When the timer finally fires, that one letter's boolean flips back to false — every letter's state and timer are independent, so you can have three letters mid-flip at once with no coordination between them.",
      },
      {
        type: 'code',
        language: 'typescript',
        code: `const toggle = (i: number) => {
  setFlipped((prev) => prev.map((v, j) => (j === i ? true : v)));
  clearTimeout(timers.current.get(i));
  timers.current.set(i, setTimeout(() => {
    setFlipped((prev) => prev.map((v, j) => (j === i ? false : v)));
  }, 1200));
};`,
      },
      { type: 'heading', text: "Why it's decorative, not the real heading" },
      {
        type: 'p',
        text: `The animated version is marked aria-hidden="true" in the real footer. That's deliberate, not an oversight: a screen reader has no use for eight independently time-bombed spans, and forcing one to track which letters are "currently flipped" would be actively hostile. The actual accessible brand name sits right above it as a plain heading — "bothmade," rendered once, in ordinary text. The playful version is a bonus for people who can see it drag their cursor across; it was never meant to carry the only copy of the name.`,
      },
    ],
  },
  {
    slug: 'a-cursor-with-a-half-second-memory',
    title: 'A cursor with a half-second memory',
    dek: "The dot and the ring that follow your pointer around the site aren't the same speed on purpose. Move your mouse in the box below.",
    tag: 'Engineering',
    accent: 'sky',
    date: '2026-10-18',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: 'Every page on the site replaces your system cursor with two small shapes: a tight dot that sits exactly where your pointer is, and a larger ring trailing a half-beat behind it. They\'re not decorative in the "looks nice" sense — the gap between them is the entire effect. A cursor that just is your pointer, one-to-one, is invisible. A second element trailing slightly behind reads as physical weight, the way a compass needle overshoots and settles rather than snapping straight to north.',
      },
      {
        type: 'statement',
        text: "The trail isn't drawn from your mouse events. It's drawn from a clock — that distinction is the entire trick.",
      },
      { type: 'heading', text: 'Try it' },
      { type: 'cursorDemo' },
      {
        type: 'p',
        text: "The dot's position is set directly from the pointer coordinates on every mousemove — no delay, no smoothing. The ring is different: its position is recomputed every animation frame by nudging it 18% of the remaining distance toward wherever the dot currently is, whether or not the mouse actually moved that frame. That's a classic lerp — linear interpolation — running off requestAnimationFrame, completely decoupled from how often mousemove events actually fire.",
      },
      {
        type: 'code',
        language: 'typescript',
        code: `let mouseX = 0, mouseY = 0;
let trailX = 0, trailY = 0;

const tick = () => {
  trailX += (mouseX - trailX) * 0.18;
  trailY += (mouseY - trailY) * 0.18;

  dot.style.transform = \`translate3d(\${mouseX}px, \${mouseY}px, 0)\`;
  trail.style.transform = \`translate3d(\${trailX}px, \${trailY}px, 0)\`;

  requestAnimationFrame(tick);
};`,
      },
      { type: 'heading', text: 'Why not just animate it with CSS transitions' },
      {
        type: 'p',
        text: "A CSS transition on the ring's position would look similar at a glance and cost nothing to write. It also can't be interrupted cleanly — retarget a transitioning element mid-flight and browsers handle the velocity discontinuity differently, which shows up as a visible stutter on fast, direction-changing mouse movement. The lerp has no such problem: every frame it just asks \"where am I, where should I be,\" and closes 18% of that gap. Change direction mid-frame and the math doesn't care — it was never animating toward a fixed target in the first place, just continuously chasing a moving one.",
      },
      {
        type: 'p',
        text: "It also only runs at all behind a matchMedia('(hover: hover) and (pointer: fine)') check, same as the magnetic buttons — a touch device has no persistent pointer position for a trailing ring to chase, so the whole thing never initializes there. No cursor replacement, no dead code paying a battery cost for an effect nobody on that device could ever see.",
      },
    ],
  },
  {
    slug: 'the-details-nobody-asks-for',
    title: 'The details nobody asks for',
    dek: 'Three small effects that never got their own post — an odometer, a scroll bar, and a reading line — because none of them are impressive alone. Try all three below.',
    tag: 'Engineering',
    accent: 'sky',
    date: '2026-10-25',
    readMinutes: 5,
    body: [
      {
        type: 'p',
        text: "Not every detail earns a whole article. Some effects are two motion values and a spring, doing one small job well, and writing a thousand words about any one of them alone would inflate something that's supposed to be quiet. So instead of three thin posts, here are three real pieces of the site's motion system in one place — each with the actual component embedded, not a description of it.",
      },
      { type: 'heading', text: 'A number that rolls up, not in' },
      {
        type: 'p',
        text: "When a real figure appears on the site, it doesn't just fade into view — it counts up from zero, prefix and suffix held still while only the numeric part animates. It exists specifically so a stat never gets a chance to be skimmed past unread; the motion holds your eye on the number for the half-second it takes to land.",
      },
      {
        type: 'stats',
        items: [
          { value: '40MB', label: 'example — prefix/suffix held still' },
          { value: '95%', label: 'example — decimals preserved too' },
          { value: '<1s', label: 'example — leading symbol untouched' },
        ],
      },
      {
        type: 'p',
        text: "Those three are illustrative, not a claim about anything — the component is built to only ever animate a number that's actually been sourced from somewhere real, on the site itself. A regex pulls the numeric core out of a string like \"40MB\" or \"<1s\", a spring drives it from zero to that target the moment it scrolls into view, and everything the regex didn't capture — the unit, the symbol — just sits there unanimated the whole time.",
      },
      { type: 'heading', text: 'A bar that knows exactly where you are' },
      {
        type: 'p',
        text: "A thin gradient line sits fixed to the top of every page, its width tracking scroll progress through the whole document. It's a small thing to notice consciously, and that's rather the point — it answers \"how much is left\" at a glance, in your peripheral vision, without asking you to look for a scrollbar that half of browsers hide by default now anyway.",
      },
      { type: 'scrollProgressDemo' },
      {
        type: 'p',
        text: "The one below is the same bar, same spring, but pointed at a small scrollable box instead of the page — Framer Motion's useScroll takes an optional container option, and swapping the page for that one ref is the entire difference between the site-wide version and this embedded one.",
      },
      { type: 'heading', text: 'The row you\'re reading, brighter than the rest' },
      {
        type: 'p',
        text: "Case-study decisions and this post's own section headings use the same effect: whichever row is passing through the center of your viewport sits at full brightness, while rows above and below dim and sit a few pixels off — not because they were animated once, but because their opacity and position are a continuous function of where they are relative to the middle of the screen, recalculated every frame you scroll.",
      },
      {
        type: 'focusListDemo',
        items: [
          'Scroll this stack and watch the middle row brighten as it passes center.',
          'Nothing here is triggered once — it tracks scroll position continuously.',
          'Scroll back up and it reverses correctly, same as everything else on this page.',
        ],
      },
      {
        type: 'p',
        text: "None of these three would carry an entire article on their own, and none of them are trying to. Put together they're most of what makes scrolling through the site feel considered rather than assembled — small, continuous reactions to exactly where you are, instead of animations that just play once and stop.",
      },
    ],
  },
  {
    slug: 'the-seam-follows-you-everywhere',
    title: 'The seam follows you everywhere',
    dek: "The hero has a draggable seam. The footer has a splitting wordmark. It turns out there's a third one, quietly running on every single page.",
    tag: 'Engineering',
    accent: 'indigo',
    date: '2026-11-01',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: "There's a fixed vertical line on the right edge of every page on the site, one pixel wide, that most visitors will never consciously register. It starts at nothing at the top of the page and grows downward as you scroll, reaching full height exactly when you reach the bottom. It isn't announced anywhere and it doesn't have a label. It's just quietly present the entire time you're on the site, the same brand idea — the seam — running in the background instead of sitting in one hero section waiting for you to find it.",
      },
      {
        type: 'statement',
        text: "The draggable seam in the hero is the idea stated once, loudly. This is the same idea, said constantly, at a volume nobody has to notice.",
      },
      { type: 'heading', text: 'Try it' },
      { type: 'seamIndicatorDemo' },
      {
        type: 'p',
        text: "That's the identical technique, just pointed at a small box instead of the whole page — a scaled useScroll reading scroll progress through that specific container, mapped directly onto scaleY with the transform origin pinned to the top. No spring this time, deliberately: the hero's seam is dragged by a hand and needs weight, but this line is reporting a fact — how far down the page you are — and a fact shouldn't lag behind what actually happened.",
      },
      {
        type: 'code',
        language: 'tsx',
        code: `const { scrollYProgress } = useScroll();

<motion.div
  className="fixed right-0 top-0 w-px h-screen bg-gradient-to-b from-white via-white to-transparent"
  style={{ scaleY: scrollYProgress, transformOrigin: 'top center' }}
/>`,
      },
      { type: 'heading', text: "Three seams, one idea, three different jobs" },
      {
        type: 'p',
        text: "The hero's seam is interactive and demands attention — it's the pitch. The footer's letter-flip is playful and rewards curiosity — it's the signature. This one asks nothing of you and is visible on literally every page you might land on, including ones with no hero and no footer visible yet — it's the ambient reminder that the idea isn't confined to the homepage. Three different implementations of the same four-pixel-wide concept, each doing a job the other two can't.",
      },
    ],
  },
  {
    slug: 'a-splash-screen-that-only-shows-up-once',
    title: 'A splash screen that only shows up once',
    dek: "The homepage opens with a two-second title sequence — a line of light expanding into the wordmark — that almost nobody has actually seen twice. Replay it below.",
    tag: 'Engineering',
    accent: 'indigo',
    date: '2026-11-08',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "Load the homepage for the first time and, for about two seconds, you don't see the hero at all. You see a thin vertical line at the center of a black screen, and it grows — first a sliver, then it starts to glow, then the glow blooms into two colored washes spreading from either edge, and finally the wordmark fades up out of the light. Then it's gone, the real page underneath fades in, and it never happens again for the rest of your visit.",
      },
      {
        type: 'statement',
        text: "It's built to be seen exactly once. Show it on every page load and it stops being an entrance and becomes an obstacle.",
      },
      { type: 'heading', text: 'Replay it' },
      { type: 'introDemo' },
      {
        type: 'p',
        text: "That's the actual sequence, unlocked from its one-per-session limit so you can trigger it as many times as you want here. On the real homepage it checks sessionStorage on mount — if a key's already set, it skips straight to \"done\" and renders nothing; if not, it sets the key immediately and starts a 1.9-second timer before fading itself out. Navigate to another page and back within the same tab and it stays gone. Close the tab and reopen the site and it plays again, because sessionStorage cleared with it.",
      },
      { type: 'heading', text: 'One timeline, four keyframes' },
      {
        type: 'code',
        language: 'typescript',
        code: `animate={{
  scaleY: [0.1, 0.5, 1, 2],
  boxShadow: [
    '0 0 0 rgba(255,255,255,0)',
    '0 0 20px rgba(255,255,255,0.4)',
    '0 0 60px rgba(255,255,255,0.6)',
    '0 0 120px rgba(255,255,255,0.9)',
  ],
}}
transition={{ duration: 1.4, times: [0, 0.3, 0.6, 1] }}`,
      },
      {
        type: 'p',
        text: "Both arrays — scaleY and boxShadow — share the same times array, so at 30% through the animation the line is exactly half-height and lightly glowing, at 60% it's full height with a strong glow, and by 100% it's overshot to twice its container height with the glow nearly maxed out, which is what actually reads as light overexposing the frame rather than a line just getting taller. The two side blooms and the wordmark are separate motion elements with their own delayed transitions, layered on top so they arrive after the line already has weight.",
      },
      { type: 'heading', text: "Why not skip it for return visitors entirely" },
      {
        type: 'p',
        text: "sessionStorage was the deliberate middle ground between two worse options. A cookie or localStorage-based \"seen it once, ever\" would mean a visitor who leaves and comes back a week later never sees the studio's own entrance again — the thing exists to make a first impression, and a week is still a first impression if enough time has passed to forget it. Showing it on literally every page navigation within one visit would train people to wait it out or, worse, to bounce before it finishes. Once per browser session is the one setting where it functions as a title sequence instead of a tax.",
      },
    ],
  },
  {
    slug: 'why-we-dont-use-smooth-scroll-libraries',
    title: "Why we don't use smooth-scroll libraries",
    dek: 'Scroll hijacking is the reason your arrow keys and Page Down "randomly stop working" on some sites. Feel the difference between the two below.',
    tag: 'Engineering',
    accent: 'sky',
    date: '2026-11-15',
    readMinutes: 5,
    body: [
      {
        type: 'p',
        text: 'If you\'ve ever landed on a site where your mouse wheel felt "floaty," where Page Down stopped doing anything, or where scrolling to the bottom took an unreasonably long, syrupy fade — you were on a site running a smooth-scroll library. Somewhere along the way, "make scrolling smoother" became a default addition to a lot of portfolio and agency sites, including plenty of good-looking ones. We don\'t run one, anywhere on this site, on purpose.',
      },
      {
        type: 'statement',
        text: "What is scroll hijacking? It's a library intercepting your native scroll input — wheel, trackpad, arrow keys — and replaying it through its own physics instead of the browser's.",
      },
      { type: 'heading', text: 'Feel it yourself' },
      { type: 'scrollCompareDemo' },
      {
        type: 'p',
        text: "The box on the left is a plain overflow-y-auto element — the browser's own scroll physics, exactly what your operating system and input device already agreed on. The box on the right intercepts every wheel event, cancels the browser's default handling of it, and replays your input through a deliberately sluggish easing loop instead — a small, honest simulation of what a scroll-hijacking library does at a larger scale, across an entire page instead of one box.",
      },
      { type: 'heading', text: 'What breaks when a library owns your scroll' },
      {
        type: 'p',
        text: "Once a library is intercepting wheel and touch events to drive its own scroll animation, it has to reimplement everything the browser used to give you for free: Page Up/Page Down, Home/End, spacebar, screen-reader scroll commands, momentum scrolling on trackpads, scroll-anchoring so the page doesn't jump when an image above you finishes loading. Most libraries reimplement some of this and quietly miss the rest — which is exactly the shape of the complaint \"scrolling on this site feels broken,\" because functionally, for that one user's input method, it is.",
      },
      {
        type: 'code',
        language: 'typescript',
        code: `// components/ScrollReset.tsx — the entire scroll-behavior
// customization on this site. Not a hijack: it doesn't touch
// wheel, keyboard, or touch input at all.
export function ScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}`,
      },
      { type: 'heading', text: 'What we do instead' },
      {
        type: 'p',
        text: "Every scroll-driven effect on this site — the sheet stack, the scrub-in text, the reading-line focus, the scroll-progress bar — reads scroll position, it never sets it. Framer Motion's useScroll subscribes to the native scrollY the browser is already tracking and turns it into a number other elements react to. The browser stays in sole control of the actual act of scrolling; nothing ever calls scrollTo or intercepts a wheel event to fake it. That's the whole difference: react to native scrolling, don't replace it.",
      },
      {
        type: 'p',
        text: "The one exception, shown above, is ScrollReset — and it's not a hijack either. It doesn't touch how scrolling behaves at all; it just resets the position to the top when you navigate to a new route, which is what browsers already do on a full page load and what single-page apps have to do manually since they never actually reload the page. Nothing about wheel, keyboard, or touch input passes through custom code anywhere on this site.",
      },
    ],
  },
  {
    slug: 'how-our-web-and-app-development-process-works',
    title: 'How our web and app development process actually works',
    dek: 'Discovery, design, build, launch — four phases, and the section of the homepage that explains them is doing more engineering than it looks like. Scroll the demo below.',
    tag: 'Process',
    accent: 'sky',
    date: '2026-11-22',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: 'People asking "what does a web design agency process actually look like" usually get one of two unsatisfying answers: a vague five-word list with no timeline, or a diagram so detailed it reads like it was written to look thorough rather than to be read. Our homepage answers it with four phases — discovery, design, build, launch — each with a real week range, laid out as cards you scroll through with a progress bar tracking how far along the whole thing you are.',
      },
      {
        type: 'statement',
        text: "The interesting part isn't the four phases. It's that the cards replay every time you scroll back into them, and the progress bar doesn't.",
      },
      { type: 'heading', text: 'Scroll through it' },
      {
        type: 'processDemo',
        phases: [
          { num: '01', title: 'Discovery', tag: 'week 0–1' },
          { num: '02', title: 'Design', tag: 'weeks 1–3' },
          { num: '03', title: 'Build', tag: 'weeks 3–9' },
        ],
      },
      {
        type: 'p',
        text: "Each card uses whileInView with viewport: { once: false } — deliberately the opposite of most of the reveal animations on this site, which play once and stay played. Scroll a phase card out of view and back in and it fades and slides in again, every single time. For a section that's explaining a sequence, that repeatability matters: if you scroll back up to re-read Design, you should see it arrive again, not sit there inert because it already \"used up\" its one entrance.",
      },
      { type: 'heading', text: "Two motion systems, one section, doing different jobs" },
      {
        type: 'code',
        language: 'typescript',
        code: `// Per-card: viewport-triggered, replayable
<motion.div
  initial={{ opacity: 0, x: -20 }}
  whileInView={{ opacity: 1, x: 0 }}
  viewport={{ once: false, margin: '-20% 0px' }}
/>

// Whole-section progress: continuous scroll position, not viewport events
const { scrollYProgress } = useScroll({
  target: containerRef,
  offset: ['start 0.2', 'end 0.8'],
});
const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);`,
      },
      {
        type: 'p',
        text: "The cards and the progress bar are driven by two genuinely different mechanisms sitting a few lines apart. whileInView is event-based — it fires when an element crosses a viewport threshold, discrete and re-triggerable. The progress bar is value-based — useScroll continuously reports a 0-to-1 number for how far the pointer target has moved through its scroll range, and the bar's width is just that number, always current, never \"triggered.\" Discrete events for things that should feel like arrivals; continuous values for things that should feel like a fact about where you are.",
      },
      { type: 'heading', text: 'Why a real week range on every phase' },
      {
        type: 'p',
        text: "It would be easy to leave the phases untimed — safer, in the sense that nothing can be checked against reality later. We put ranges on them anyway, because a process description without a timeline isn't actually answering the question \"how long does this take,\" which is the question underneath most of the others. Week 0–1 for discovery, weeks 1–3 for design, and so on aren't marketing copy; they're what we tell a client on the first call, published in the same words.",
      },
    ],
  },
  {
    slug: 'a-two-axis-stagger-animation-explained',
    title: 'A two-axis stagger animation, explained',
    dek: 'How to stagger a grid of items by both column and position with one small formula — the technique behind the tech-stack chips on our service pages.',
    tag: 'Engineering',
    accent: 'purple',
    date: '2026-11-29',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "A basic stagger animation is easy: give item N a delay of N times some constant, and a list cascades in one row at a time. It gets less obvious the moment your content isn't a single list — our service pages show technology chips grouped into columns (Frontend, Backend, Tooling), and a naive per-item stagger across the whole page would either ignore the grouping entirely or force every column to wait for the ones before it to finish first.",
      },
      {
        type: 'statement',
        text: 'delay: idx * 0.08 + i * 0.05 — two independent counters, added together, and the whole grid cascades diagonally instead of column by column.',
      },
      { type: 'heading', text: 'Try it' },
      {
        type: 'stackChipsDemo',
        columns: [
          { heading: 'Frontend', items: ['React', 'Next.js', 'TypeScript'] },
          { heading: 'Backend', items: ['Postgres', 'Prisma', 'REST'] },
        ],
      },
      {
        type: 'p',
        text: "Each column gets its own whileInView trigger with delay: idx * 0.08 — column 0 starts immediately, column 1 waits 80ms, and so on. Independently, each chip inside a column gets delay: i * 0.05, where i resets to zero at the start of every column. Combine them — idx * 0.08 + i * 0.05 — and the result isn't \"finish column 1, then start column 2\": it's a diagonal wave, where column 2's first chip can appear before column 1's third chip does, because 0.16 (column 2, chip 0) is less than 0.10 + 0.05 (column 1, chip 2's math, roughly).",
      },
      {
        type: 'code',
        language: 'tsx',
        code: `{columns.map((col, idx) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ delay: idx * 0.08 }}   // column offset
    viewport={{ once: true }}
  >
    {col.items.map((item, i) => (
      <motion.li
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.08 + i * 0.05 }}  // + chip offset
        viewport={{ once: true }}
      >
        {item}
      </motion.li>
    ))}
  </motion.div>
))}`,
      },
      { type: 'heading', text: 'Why not framer-motion\'s built-in staggerChildren' },
      {
        type: 'p',
        text: "Framer Motion has a variants-based staggerChildren option that handles the single-axis case elegantly — parent orchestrates, children just declare a variant name. It works well when every child should follow the exact same fixed delay increment. It works less well the moment you have two independent groupings that should each contribute their own offset, because staggerChildren computes one delay per child based on its index in a flat list — it doesn't know about \"column\" as a concept. Two counters added by hand is a few more characters than a variants config, and it's the version that actually generalizes to a grid.",
      },
      { type: 'heading', text: 'The hover lift is a separate, much smaller decision' },
      {
        type: 'p',
        text: "Once a chip has arrived, hovering it lifts it half a pixel and brightens its border and text — a plain CSS transition, not Framer Motion at all, because it doesn't need spring physics or scroll awareness; it just needs to feel responsive on :hover, which transition-all duration-300 already does for free. Not every piece of motion on a page needs the same tool. The entrance needed viewport awareness and staggered timing, so it got a motion library. The hover state needed neither, so it got two Tailwind classes.",
      },
    ],
  },
  {
    slug: 'how-much-does-it-actually-cost',
    title: 'How much does it actually cost?',
    dek: "Real starting prices, pulled live from the same pricing engine that runs our checkout — not a 'contact us for a quote.' Pick a service below.",
    tag: 'Process',
    accent: 'sky',
    date: '2026-12-06',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: '"How much does it cost to build an app" is a question most studio websites dodge — you fill out a form, wait two days, and get a number that was decided by whoever answered your email that morning. We\'d rather just tell you the starting price up front, because a real number you can see before talking to anyone is worth more than a promise that we\'ll be fair about it later.',
      },
      {
        type: 'statement',
        text: 'These are not marketing figures written for this post. This is the same pricing.ts file our actual checkout charges against.',
      },
      { type: 'heading', text: 'Pick a service' },
      { type: 'pricingDemo' },
      {
        type: 'p',
        text: "That component imports BASE_SERVICES directly from lib/pricing.ts and reads the price off it — it isn't a number typed into this post by hand. If we ever change what a website starts at, this demo updates the next time the site deploys, automatically, because it's reading the exact same constant /start and our Stripe checkout read.",
      },
      { type: 'heading', text: "Why 'starting price' and not 'the price'" },
      {
        type: 'p',
        text: "The number above is the base — what a Website, Web App, or iOS App costs with nothing added. Almost nothing ships at the base price alone, because real projects need at least a few of what we scope as add-ons: a CMS, e-commerce, user accounts, an admin dashboard, ongoing maintenance. Our actual calculator at /start walks through every add-on individually so the total you see before paying anything is the real total, not the base figure with a surprise waiting at the bottom.",
      },
      { type: 'heading', text: 'Why show this instead of hiding behind a contact form' },
      {
        type: 'p',
        text: "A generic \"contact us for pricing\" isn't neutral — it's a lead-qualification filter that also happens to hide the number from people who'd rather not have a sales conversation before they know if they can afford one. We already run fixed-scope-fixed-price checkout end to end; the number was never a secret internally. The only decision was whether to also say it out loud on the website, and we didn't see a reason not to.",
      },
    ],
  },
  {
    slug: 'recreating-the-ios-app-launch-animation',
    title: 'Recreating the iOS app-launch animation, on the web',
    dek: 'A shared-element transition — a home-screen icon expanding into the app it opens — built with two rects and AnimatePresence, no native APIs involved. Tap an icon below.',
    tag: 'Engineering',
    accent: 'indigo',
    date: '2026-12-13',
    readMinutes: 5,
    body: [
      {
        type: 'p',
        text: "Tap an app icon on an iPhone and it doesn't just appear — it grows out of exactly where you tapped, its corners squaring off as it fills the screen. It's one of the most recognizable pieces of motion in software, and it's a genuinely hard thing to fake on the web, because the icon and the fullscreen view it becomes are usually two completely different DOM elements with no natural way to animate between them. Our iOS service page opens with that exact transition anyway.",
      },
      {
        type: 'statement',
        text: "The trick is measuring where the icon actually is, then animating a second element from that measured rect to fill the screen. Nothing moves — the icon and the panel are just choreographed to line up.",
      },
      { type: 'heading', text: 'Tap an icon' },
      { type: 'springboardDemo' },
      {
        type: 'p',
        text: 'This is the same underlying technique as the real page, scaled to a small stage: tapping an icon calls getBoundingClientRect() on the button you clicked and on the container it lives in, subtracts the two to get the icon\'s position relative to the stage, and stores that as a plain { top, left, width, height } rect — not a DOM reference, just four numbers.',
      },
      {
        type: 'code',
        language: 'typescript',
        code: `const launch = (e: React.MouseEvent<HTMLButtonElement>) => {
  const el = e.currentTarget.getBoundingClientRect();
  const host = stageRef.current!.getBoundingClientRect();

  setLaunching({
    top: el.top - host.top,
    left: el.left - host.left,
    width: el.width,
    height: el.height,
  });
  setOpen(true);
};`,
      },
      { type: 'heading', text: "A second element inherits that rect as its starting point" },
      {
        type: 'code',
        language: 'tsx',
        code: `<motion.div
  initial={{ ...launching, borderRadius: '22%' }}
  animate={{ top: 0, left: 0, width: '100%', height: '100%', borderRadius: 0 }}
  transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
/>`,
      },
      {
        type: 'p',
        text: "The icon you tapped never moves at all — it's a completely unrelated element that fades out under a blur. A brand-new motion.div mounts with initial values equal to the icon's measured rect, exactly overlapping it for one frame, then animates to fill the stage. Because the starting position, size, and corner radius all match the icon precisely, the illusion reads as one object growing rather than two objects that happen to be choreographed. This is the shared-element / FLIP pattern (First, Last, Invert, Play) — measure before, measure after, animate the delta — done by hand instead of through a dedicated layout-animation library.",
      },
      { type: 'heading', text: "Why not Framer Motion's layoutId" },
      {
        type: 'p',
        text: "Framer Motion actually ships a purpose-built tool for exactly this — give two elements the same layoutId and it handles the FLIP measuring automatically, even across a conditional mount/unmount. We didn't reach for it here because the source and destination aren't really \"the same element in two states\" the way layoutId assumes — the icon stays a small square glyph forever, and the destination is a fully different fullscreen layout with its own content fading in on a delay. Manual rects gave more control over exactly when the icon fades versus when the panel's content arrives, at the cost of writing the coordinate math by hand instead of trusting a shared ID to infer it.",
      },
    ],
  },
  {
    slug: 'type-that-reaches-toward-your-cursor',
    title: 'Type that reaches toward your cursor',
    dek: "Letters that get heavier and brighter the closer your mouse gets, using a variable font's weight axis instead of a swapped font file. Move your cursor near the word below.",
    tag: 'Engineering',
    accent: 'sky',
    date: '2026-12-20',
    readMinutes: 5,
    body: [
      {
        type: 'p',
        text: "A variable font isn't one font file — it's a continuous range of one, with axes like weight or width you can dial to any value instead of picking from a fixed set of \"Regular / Medium / Bold\" cuts. Almost nobody uses that continuity for anything interactive; it mostly gets used the same way a normal font would, just picking a couple of fixed weights and calling it done. Our web service page hero does something with it that a static weight can't: each letter's weight tracks how close your cursor is to it, in real time.",
      },
      {
        type: 'statement',
        text: "Nothing is swapped, cropped, or cross-faded. One property — font-variation-settings — is just being set to a different number, sixty times a second, per letter.",
      },
      { type: 'heading', text: 'Move your cursor near this' },
      { type: 'kineticWordDemo', word: 'REACH' },
      {
        type: 'p',
        text: "Every letter measures its own distance to the cursor on every animation frame and maps that distance to a 0–1 value using smoothstep — the same t*t*(3-2*t) curve used to avoid a mechanical linear ramp — then uses that value to interpolate the weight axis between 260 (light) and 900 (heavy), and the color between a dim, desaturated blue and a bright, saturated one. Move away and the letters behind you cool back down on their own, because the calculation runs continuously — there's no explicit \"unhover\" event to write, just distance getting larger again.",
      },
      {
        type: 'code',
        language: 'typescript',
        code: `const r = letter.getBoundingClientRect();
const d = Math.hypot(mx - (r.left + r.width / 2), my - (r.top + r.height / 2));
const raw = Math.max(0, 1 - d / 300);       // 0 past 300px, 1 at the center
const t = raw * raw * (3 - 2 * raw);        // smoothstep

letter.style.fontVariationSettings = \`'wght' \${Math.round(260 + t * 640)}\`;
letter.style.color = \`rgba(\${186 + t*69}, \${230 + t*25}, 252, \${0.2 + t*0.8})\`;`,
      },
      { type: 'heading', text: "It never actually sits still" },
      {
        type: 'p',
        text: "If the pointer hasn't moved in 2.6 seconds, the loop switches from cursor-distance to a slow per-letter sine wave — each letter breathing between light and slightly heavier on its own gentle offset, so the word never looks frozen when nobody's touching it. That threshold matters more than it sounds like it should: without it, a word that hasn't been touched yet just sits at its lightest weight looking inert, which reads as broken rather than as \"waiting for you.\" The idle animation is what tells a first-time visitor there's something here to discover before they've found it themselves.",
      },
      { type: 'heading', text: 'Why raw style mutation instead of React state' },
      {
        type: 'p',
        text: "Every letter's style is written directly via letter.style.fontVariationSettings, completely outside React's render cycle — not useState, not a Framer Motion value. At up to 60 updates per second across every letter in the word simultaneously, routing that through React re-renders would mean scheduling and diffing work the browser doesn't actually need, when a direct DOM mutation on an already-existing element is exactly what requestAnimationFrame loops are for. React owns mounting the spans once; after that, the animation loop owns them completely until the component unmounts and the loop is cancelled.",
      },
    ],
  },
  {
    slug: 'the-scroll-zoom-flying-through-text-effect',
    title: 'The scroll-zoom "flying through text" effect',
    dek: 'How Apple-style product pages make giant words fly toward you as you scroll — it\'s three transforms and a shared timeline, not a video. Scroll the demo below.',
    tag: 'Engineering',
    accent: 'purple',
    date: '2026-12-27',
    readMinutes: 5,
    body: [
      {
        type: 'p',
        text: "A lot of premium-feeling product pages open with a sequence where a giant word sits centered on screen, then as you keep scrolling it rushes toward you — scaling up far past the viewport, fading out right as the next word arrives small and settles into place. It reads like a camera flying through a tunnel of oversized text. It's genuinely just a handful of numbers on a timeline, no video, no WebGL, no scroll-jacking.",
      },
      {
        type: 'statement',
        text: "Each word owns a slice of one shared 0-to-1 scroll value. Nothing is happening simultaneously by accident — every word's arrival and exit is a deliberate window on the same timeline.",
      },
      { type: 'heading', text: 'Scroll through it' },
      { type: 'flyThroughDemo', words: ['FAST.', 'FLUID.', 'CONVERTS.'] },
      {
        type: 'p',
        text: "The section wraps a tall, pinned container — same position: sticky pattern as the sheet-stack section — and useScroll reports one continuous 0-to-1 value for how far you've scrolled through it. Each word divides that range into its own slot: it starts small and transparent, scales up to a resting size and full opacity, holds there while you keep scrolling, then — in its exit window — scales up roughly nine times its resting size while fading out, at the exact moment the next word is entering its own slot at a small scale. The overlap is what sells the illusion: word one is mid-exit while word two is mid-entrance, occupying the same few frames.",
      },
      {
        type: 'code',
        language: 'typescript',
        code: `// Each word gets four checkpoints on the shared 0–1 timeline:
// [enterStart, settled, exitStart, exitEnd]
const scale = useTransform(
  progress,
  [enterStart, settled, exitStart, exitEnd],
  [0.55, 1, 1, 9]     // small → resting → resting → huge
);
const opacity = useTransform(
  progress,
  [enterStart, settled, exitStart, exitEnd],
  [0, 1, 1, 0]        // fades in on arrival, fades out on exit
);`,
      },
      { type: 'heading', text: 'The part that actually sells it' },
      {
        type: 'p',
        text: "Scaling from 1 to 9 is the easy half. The part that makes it read as flight rather than \"a word getting bigger\" is that the opacity fade-out is compressed into a much narrower window than the scale-up — the word is still small-ish and readable for most of its exit, then rushes past full size and vanishes in the last few percent of its slot. If opacity faded out at the same rate as the scale grew, the word would just get faint and huge at the same steady pace, which reads as dissolving, not approaching. The mismatch between how fast it scales versus how fast it fades is the whole trick.",
      },
      { type: 'heading', text: "Why a spring wraps the raw scroll value" },
      {
        type: 'p',
        text: "scrollYProgress itself is not smoothed — it's an exact, sometimes-jittery reflection of scroll position, especially on a trackpad sending rapid small deltas. Every transform in this sequence reads from a useSpring-wrapped copy of that value instead of the raw one, which is what keeps a giant word's scale from visibly stepping instead of gliding when your scroll input isn't perfectly smooth. It's a small addition — one extra hook — for a section where any stutter in a 9x scale-up would be the first thing anyone noticed.",
      },
    ],
  },
  {
    slug: 'a-css-3d-scene-that-tilts-toward-your-cursor',
    title: 'A CSS 3D scene that tilts toward your cursor',
    dek: "How our Vision Pro page fakes headset parallax with rotateX/rotateY and a handful of translateZ values — real CSS 3D, no library. Move your cursor over the demo below.",
    tag: 'Engineering',
    accent: 'purple',
    date: '2027-01-03',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "Screenshots can't show what a Vision Pro app feels like, because the entire point of the platform is that content sits at different depths in physical space around you — move your head and closer things shift more than far things, the way real objects do. Our Vision Pro service page fakes a version of that on a flat screen: move your pointer over the hero and the whole scene tilts, with UI cards floating at different simulated depths, using nothing but CSS 3D transforms.",
      },
      {
        type: 'statement',
        text: 'transform-style: preserve-3d turns a flat stack of divs into a rigid object — rotate the parent, and every child keeps its position in 3D space relative to the others, not just visually layered on top.',
      },
      { type: 'heading', text: 'Move your cursor over this' },
      { type: 'parallaxDemo' },
      {
        type: 'p',
        text: "Pointer position inside the container maps to two rotation values — how far left/right you are becomes rotateY, how far up/down becomes rotateX — both run through a spring so the tilt settles rather than snapping to the cursor. The container carries perspective on its parent and transform-style: preserve-3d on itself; without that second property, child elements with their own translateZ would just render flat, because the browser wouldn't treat them as sharing one 3D space with their parent's rotation.",
      },
      {
        type: 'code',
        language: 'tsx',
        code: `<div style={{ perspective: '1000px' }}>
  <motion.div style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}>
    <div style={{ transform: 'translate3d(-90px, -50px, -80px)' }}>
      {/* a card sitting further away */}
    </div>
    <div style={{ transform: 'translateZ(50px)' }}>
      {/* the near card, closest to the viewer */}
    </div>
  </motion.div>
</div>`,
      },
      { type: 'heading', text: 'Why depth instead of just parallax scroll speeds' },
      {
        type: 'p',
        text: "A cheaper version of \"depth\" just moves background layers slower than foreground layers on scroll — real parallax, but along one axis, and it doesn't respond to anything but scroll position. This scene responds to pointer position on two axes simultaneously, and because it's genuine 3D transforms rather than simulated offsets, every element's perceived movement is mathematically consistent with its actual translateZ — a card 80px \"deeper\" moves a specific, correct amount less than a card at 50px, the same way it would if you were actually looking at a physical diorama and shifted your head.",
      },
      { type: 'heading', text: "Why it's the one hero with no scroll-pinned sequence" },
      {
        type: 'p',
        text: "Every other platform page on the site (web, iOS) opens with a scroll-driven sequence — the sheet stack, the fly-through words. Vision Pro's hero doesn't scroll-pin at all; it responds to the pointer sitting still and moving around inside a fixed viewport. That's deliberate, not an oversight: a headset doesn't have a scrollbar, and the platform's whole interaction model is about your position and gaze in a space rather than a linear feed you move through. The hero's mechanic matches the platform's actual interaction language instead of reusing the site's own default pattern out of habit.",
      },
    ],
  },
  {
    slug: 'we-dont-disappear-after-launch',
    title: "We don't disappear after launch",
    dek: "The most common complaint about studios isn't the work — it's what happens the week after you pay the final invoice. Here's what stays true here.",
    tag: 'Process',
    accent: 'sky',
    date: '2027-01-10',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "Ask around and the same story comes up: a studio delivers, gets paid, and the person who understood the codebase is suddenly two weeks behind on emails, then a month, then gone onto the next client entirely. Nothing about the contract was violated — \"launch\" was the deliverable, and launch happened. It's just that the moment a product actually meets real users is exactly when you need the people who built it the most, and that's precisely when a lot of studios stop being reachable.",
      },
      {
        type: 'statement',
        text: "Shipping was never the exit for us. It's closer to the point where the actual feedback loop starts.",
      },
      { type: 'heading', text: 'What "still here" actually means' },
      {
        type: 'supportTimelineDemo',
        milestones: [
          { label: 'Launch', desc: 'We watch it live, not just the deploy log.' },
          { label: 'Week 1', desc: 'Fix what real usage surfaces that testing didn\'t.' },
          { label: 'Month 1', desc: 'First real look at what users actually do.' },
          { label: 'Ongoing', desc: 'Same two people. Same phone number.' },
        ],
      },
      {
        type: 'p',
        text: "That's not a support tier we upsell after the fact — it's the same relationship that built the thing, continuing. When something breaks under real traffic three weeks in, you're not opening a ticket into a queue and hoping it lands on someone who remembers this codebase. You're messaging the person who wrote the code that broke.",
      },
      { type: 'heading', text: 'Why this is worth saying out loud' },
      {
        type: 'p',
        text: "We could leave this implicit and let it show up in how we actually behave after a launch. We're saying it explicitly instead, because it's genuinely one of the differences between studios that's hard to evaluate before you've hired one — everyone's pitch deck says \"ongoing support,\" and the only way to find out what that means is to already be a client when something goes wrong. Naming it specifically, with a timeline, is at least something you can hold us to before you've signed anything.",
      },
    ],
  },
  {
    slug: 'actually-respecting-prefers-reduced-motion',
    title: 'Actually respecting prefers-reduced-motion',
    dek: "Most sites check the media query once and call it done. Here's what that misses, and how every animation on this site handles it properly. Try the toggle below.",
    tag: 'Engineering',
    accent: 'indigo',
    date: '2027-01-17',
    readMinutes: 5,
    body: [
      {
        type: 'p',
        text: "prefers-reduced-motion isn't a niche accessibility checkbox — it's a real operating-system setting that people turn on because motion genuinely causes them physical discomfort: vestibular disorders, migraines, motion sickness triggered by parallax and scaling effects. A site that ignores it isn't just failing an audit, it's making itself unusable for a specific set of real visitors. And \"ignoring it\" is often not a decision anyone made on purpose — it's just what happens by default, because nothing forces you to check.",
      },
      {
        type: 'statement',
        text: "The setting exists at the OS level. The bug isn't forgetting it exists — it's checking it once on mount and missing every animation added after that.",
      },
      { type: 'heading', text: 'See it side by side' },
      { type: 'reducedMotionToggleDemo' },
      {
        type: 'p',
        text: "That toggle simulates the two states this site actually renders — not a CSS trick, a real branch in the component. With motion on, tapping the card plays a spring-driven scale-and-rotate entrance. With motion \"reduced,\" the identical card just appears at its resting state, no animation at all, not even a fast version of the same motion. A shortened animation still moves; for someone who's turned this setting on, movement is the problem, not the duration.",
      },
      {
        type: 'code',
        language: 'tsx',
        code: `const reduceMotion = useReducedMotion(); // Framer Motion hook

if (reduceMotion) {
  return <div className={className}>{content}</div>;   // no motion props at all
}

return (
  <motion.div
    initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
    animate={{ opacity: 1, scale: 1, rotate: 0 }}
    transition={{ type: 'spring', stiffness: 260, damping: 16 }}
  >
    {content}
  </motion.div>
);`,
      },
      { type: 'heading', text: "Why every component checks it independently" },
      {
        type: 'p',
        text: "A single top-level check — read the media query once in a layout, store it in context — misses two things a per-component check doesn't. First, useReducedMotion() from Framer Motion subscribes to the media query live, so a visitor who changes the OS setting in another window sees this site respond immediately, without a reload. Second, and more important: every animated component on this site — the drag seam, the sheet stack, the kinetic type, the parallax scene — makes its own independent decision about what its reduced-motion fallback should look like, because \"remove the motion\" means something different for a spring-driven drag handle than it does for a scroll-pinned sequence. A single global switch can turn animation off; it can't know what each component should show instead.",
      },
      { type: 'heading', text: "The part that's easy to get wrong" },
      {
        type: 'p',
        text: "The failure mode isn't usually \"we never check prefers-reduced-motion\" — it's checking it in the first three components you build and forgetting on the fifteenth. There's no compiler error for a missing useReducedMotion() call; the component just works fine for the vast majority of visitors who never turn the setting on, and silently fails the ones who did. The only real defense is treating it as a required part of writing any new motion component, the same way you wouldn't ship an image without an alt attribute — not a pass you do at the end.",
      },
    ],
  },
  {
    slug: 'type-anything-kinetic-playground',
    title: 'Type anything — a kinetic type playground',
    dek: "The cursor-reactive variable-weight effect from our web hero, except this time you pick the word. Go ahead, type something.",
    tag: 'Engineering',
    accent: 'purple',
    date: '2027-01-24',
    readMinutes: 2,
    body: [
      {
        type: 'p',
        text: "We already wrote up how the cursor-reactive kinetic type on our web hero works — per-letter font-variation-settings weight tracking pointer distance. This one's not really an explainer. It's the same mechanic, minus the fixed word, so you can just type whatever you want and watch it react instead of reading about it happening to someone else's headline.",
      },
      { type: 'kineticPlaygroundDemo' },
      {
        type: 'p',
        text: "Move your cursor near it, type your name, type a client's name, type nothing and leave it idle for a few seconds to see the resting sine-wave breathing take over. It's the exact same requestAnimationFrame loop from the real hero — the only thing that changed is the letters come from an input value instead of a hardcoded prop, so the component re-measures whatever's currently rendered on every keystroke.",
      },
      {
        type: 'p',
        text: 'If you want the mechanics — the smoothstep easing, the idle fallback, why it mutates the DOM directly instead of going through React state — that\'s the earlier post: "Type that reaches toward your cursor." This one\'s just for playing with it.',
      },
    ],
  },
  {
    slug: 'our-calculator-wont-sell-you-something-broken',
    title: "Our pricing calculator won't sell you something broken",
    dek: "Check e-commerce without a backend and most quote tools just take your money. Ours won't let the selection be inconsistent in the first place. Try it below.",
    tag: 'Process',
    accent: 'sky',
    date: '2027-01-31',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "E-commerce needs somewhere to store orders. A booking system needs somewhere to store bookings. Neither of those is optional — they're not features you could theoretically ship without a backend, they're features that are a backend with a nice interface on top. A pricing calculator that lets you check \"E-commerce\" without also accounting for the backend it structurally requires isn't being flexible, it's just wrong, and whoever sold it that way finds out at kickoff, not at checkout.",
      },
      {
        type: 'statement',
        text: "Check something that needs a backend, and the backend gets added for you — not as an upsell, as a correction to keep the selection actually buildable.",
      },
      { type: 'heading', text: 'Try it' },
      { type: 'dependencyDemo' },
      {
        type: 'p',
        text: 'That checklist calls expandAddOnDependencies() imported directly from lib/pricing.ts — the exact function our real /start calculator runs on every selection change. It walks a small dependency map (ADD_ON_REQUIRES) and keeps expanding the selected set until nothing new gets pulled in — e-commerce and booking both silently require Custom Backend / API, and subscriptions requires that plus user accounts. Nothing about this is a growth trick to inflate the invoice; it\'s the calculator refusing to represent a combination that can\'t actually be built.',
      },
      {
        type: 'code',
        language: 'typescript',
        code: `export const ADD_ON_REQUIRES: Partial<Record<AddOnKey, AddOnKey[]>> = {
  ecommerce: ['custom-backend'],
  booking: ['custom-backend'],
  subscriptions: ['custom-backend', 'user-accounts'],
  'push-notifications': ['custom-backend'],
  'admin-dashboard': ['custom-backend'],
};

export function expandAddOnDependencies(selected: AddOnKey[]): AddOnKey[] {
  const result = new Set(selected);
  let grew = true;
  while (grew) {
    grew = false;
    for (const key of Array.from(result)) {
      for (const req of ADD_ON_REQUIRES[key] ?? []) {
        if (!result.has(req)) { result.add(req); grew = true; }
      }
    }
  }
  return Array.from(result);
}`,
      },
      { type: 'heading', text: "It also refuses to double-charge you" },
      {
        type: 'p',
        text: "The reverse case matters just as much. A Web App's base price already assumes a backend and user accounts — that's what \"an app people log into\" means. If a client checked \"Web App\" and separately checked \"Custom Backend / API,\" a naive calculator would just add both line items and charge twice for the same underlying thing. BASE_SERVICE_INCLUDES marks that add-on as already bundled for that base service — still shown as included in the summary, since the product genuinely has it, but priced at zero and locked, because unchecking it wouldn't actually remove a backend from a Web App.",
      },
      { type: 'heading', text: 'Why bother, if most visitors would never notice' },
      {
        type: 'p',
        text: "Most people configuring a quote don't know which add-ons quietly require a backend — that's exactly why this logic has to live in the tool instead of in a salesperson's head. The alternative isn't \"nothing goes wrong,\" it's \"something goes wrong quietly, later, when the mismatch surfaces mid-build instead of at the moment you picked the wrong combination.\" A calculator that can represent an impossible selection eventually will, for someone, and the honest fix is making the impossible selection unrepresentable in the first place.",
      },
    ],
  },
  {
    slug: 'an-accessible-mobile-menu-focus-scroll-lock-escape',
    title: 'An accessible mobile menu: focus, scroll lock, and Escape',
    dek: "The three things a mobile nav overlay has to get right that most tutorials skip. Tap the icon below, then try pressing Escape.",
    tag: 'Engineering',
    accent: 'indigo',
    date: '2027-02-07',
    readMinutes: 5,
    body: [
      {
        type: 'p',
        text: "A mobile hamburger menu looks like a solved problem — toggle a boolean, slide a panel in, done. Most implementations that stop there are missing at least one of three things a real overlay needs: the page behind it has to stop scrolling, the keyboard has to be able to close it without hunting for a tiny X button, and the visual state (hamburger vs. X) has to actually reflect whether it's open, not just visually but to assistive tech too.",
      },
      {
        type: 'statement',
        text: "An open menu owns the screen. That's not a style choice — it's a contract with three separate implications, and skipping any one of them is a real bug, not a nitpick.",
      },
      { type: 'heading', text: 'Try it' },
      { type: 'mobileMenuDemo' },
      {
        type: 'p',
        text: "Tap the hamburger and it morphs into an X — two motion.span lines rotating into a cross via animate, not a font-icon swap. Once it's open, try pressing Escape; it closes the same way tapping the icon does. That's not a browser default for a custom overlay — it's a keydown listener attached only while the menu is open, and removed the moment it closes, so it never intercepts Escape anywhere else on the page.",
      },
      {
        type: 'code',
        language: 'typescript',
        code: `useEffect(() => {
  if (!open) return;

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';        // scroll lock

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);        // keyboard close
  };
  window.addEventListener('keydown', onKey);

  return () => {
    document.body.style.overflow = previousOverflow;
    window.removeEventListener('keydown', onKey);
  };
}, [open]);`,
      },
      { type: 'heading', text: 'Why the scroll lock has to save the previous value' },
      {
        type: 'p',
        text: "Setting overflow: 'hidden' on open and overflow: '' on close looks equivalent to saving and restoring the previous value, until something else on the page also manages document.body.style.overflow — a different modal, a loading state. Capturing previousOverflow before overwriting it and restoring exactly that value on cleanup means this effect never assumes it's the only code with an opinion about body scroll, even though today, on this site, it happens to be.",
      },
      { type: 'heading', text: "aria-expanded is not optional decoration" },
      {
        type: 'p',
        text: "The toggle button carries aria-expanded={open} and an aria-label that changes between \"Open menu\" and \"Close menu\" — not because it changes what the button looks like, but because a screen reader user gets zero visual information from the hamburger-to-X morph. Without aria-expanded, that same user has no way to know whether pressing the button again opens or closes something; the two icon states carry meaning only sighted users can see unless the accessibility tree says it explicitly.",
      },
    ],
  },
  {
    slug: 'wed-rather-show-you-an-empty-box',
    title: "We'd rather show you an empty box",
    dek: "No stock photos, ever — when a real screenshot doesn't exist yet, the site shows a labeled placeholder instead of faking one. See both side by side.",
    tag: 'Design',
    accent: 'purple',
    date: '2027-02-14',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: "Every case study on this site has a slot for real product screenshots — and for work that's still in progress, some of those slots are genuinely empty, because the screen doesn't exist to photograph yet. The easy fix is a stock photo: someone smiling at a laptop, a vague dashboard mockup that looks plausible from six feet away. It fills the space. It also isn't the product, and pretending otherwise for the sake of a tidier-looking page is exactly the kind of small dishonesty that compounds.",
      },
      {
        type: 'statement',
        text: "An empty, labeled frame tells the truth: this doesn't exist yet. A stock photo tells a small lie the same size as the box it's filling.",
      },
      { type: 'heading', text: 'Side by side' },
      { type: 'honestFrameDemo' },
      {
        type: 'p',
        text: "The real component — ShotFrame inside CaseStudy.tsx — checks whether a shot has a src. If it does, it renders the actual image with a real alt description. If it doesn't, it renders a dashed border, the shot's intended caption in mono type, and a small note pointing at exactly where to add the file once it exists. Both states use the same layout dimensions, so the page never visually jumps once a real screenshot lands — the empty frame is placeholder geometry with an honest label, not a broken image tag or a lorem-ipsum stand-in.",
      },
      { type: 'heading', text: "Why this is harder than it sounds to keep doing" },
      {
        type: 'p',
        text: "The temptation to fill an empty box only gets stronger the longer it stays empty — a case study that's sat unfinished for a few weeks starts to feel like it needs to look done. The actual discipline here isn't the component, which took a few lines; it's not reaching for a placeholder image the fifth time a page feels a little sparse. The dashed frame is a small, constant reminder pointed at us as much as at anyone reading the page: this isn't finished, and the honest thing is to say so rather than dress it up.",
      },
    ],
  },
  {
    slug: 'tell-us-whats-actually-wrong',
    title: "Tell us what's actually wrong",
    dek: "Most quote forms ask what package you want. We'd rather start from the actual problem — pick one below and see what it's really costing you.",
    tag: 'Process',
    accent: 'sky',
    date: '2027-02-21',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "A typical quote request asks you to already know the answer: pick a package, pick a page count, pick features off a list written by someone who's never seen your business. That works fine if you already know exactly what you need. Most people asking for a website or an app don't — they know something is costing them customers or time, and they're hoping the person on the other end can translate that into the right build. So we start there instead.",
      },
      {
        type: 'statement',
        text: "The problem comes first. What actually fixes it comes second. The package comes last, and only after both of those are settled.",
      },
      { type: 'heading', text: 'Pick what sounds familiar' },
      { type: 'diagnosisDemo' },
      {
        type: 'p',
        text: "That's not summarized or paraphrased — it's reading directly out of PAIN_POINT_BRIEFS in lib/pricing.ts, the same structured data our own sales process uses internally to make sure every conversation about \"no online booking\" or \"slow site\" actually lands on the same real cost and the same real fix, instead of depending on whoever happens to be on the call that day to remember it correctly.",
      },
      { type: 'heading', text: "Why 'needs' and 'upsell' are kept separate" },
      {
        type: 'p',
        text: "Every pain point in that file distinguishes between what genuinely fixes the problem (needs — no fix without it) and real, useful extras that are only worth raising once the core is agreed (upsell). \"No online booking\" needs a booking system; a CRM integration is a legitimate upsell on top of that, not a substitute for it. Keeping those two lists structurally separate in the data means a scope can't accidentally include the extra while skipping the actual fix, and it means a conversation about your problem doesn't turn into a conversation about add-ons before the core has even been agreed.",
      },
      { type: 'heading', text: "What this replaces" },
      {
        type: 'p',
        text: "It replaces the version of this conversation where the actual diagnosis lives entirely in one person's head, gets phrased slightly differently every time, and drifts a little further from what actually matters each time it's retold. Writing it down as structured data — a real problem statement, a real cost, a real fix — means the diagnosis is the same whether you talk to us on a Tuesday or a Friday, and it's the same thing driving both the conversation and the actual scope that gets built.",
      },
    ],
  },
  {
    slug: 'why-batch-writes-get-wrapped-in-one-transaction',
    title: 'Why batch writes get wrapped in one transaction',
    dek: "Importing five records and record four fails — do you keep the first three, or nothing? Toggle the demo below to see both outcomes.",
    tag: 'Engineering',
    accent: 'indigo',
    date: '2027-02-28',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: "Import a batch of records — a CSV upload, a bulk create, anything that writes several rows in one logical operation — and eventually one of them will fail partway through: a duplicate, a constraint violation, a bad value in row 4 of 200. The question that matters isn't \"how do we handle the error,\" it's \"what state is the database left in the moment it happens.\" Without a transaction, the honest answer is: however far it got. Three successful writes, a failure, and 196 rows that never ran — a batch operation that partially happened.",
      },
      {
        type: 'statement',
        text: 'prisma.$transaction() turns a list of writes into one atomic unit — either every one of them commits, or none of them do. There is no partial state to clean up after.',
      },
      { type: 'heading', text: 'See both outcomes' },
      { type: 'transactionDemo' },
      {
        type: 'p',
        text: "Run it unwrapped and record 4 fails while 1 through 3 sit there committed and 5 never runs — real, permanent rows in the database that now need their own manual cleanup, because the failure happened, but so did the successes before it. Run it wrapped and record 4 still fails, but everything else rolls back with it — the database ends the operation in exactly the state it started in, as if the batch had never been attempted.",
      },
      {
        type: 'code',
        language: 'typescript',
        code: `// Real pattern, from a CSV import route on this site:
const created = await prisma.$transaction(
  deduped.map((data) => prisma.record.create({ data }))
);
// If ANY create() in that array throws, none of them persist.
// The route's catch block runs against a database unchanged
// by the attempt — no partial import to reconcile by hand.`,
      },
      { type: 'heading', text: 'Why this matters more for imports than single writes' },
      {
        type: 'p',
        text: "A single failed write is usually easy to reason about — it either happened or it didn't, and the user sees an error either way. A batch is where partial failure gets genuinely dangerous, because the operation looks like it happened (three rows, five rows, whatever got through) without actually completing the thing the user asked for. \"Import my 200 leads\" that silently becomes \"import my first 47 leads\" is a worse failure mode than an outright rejected import, because nobody notices the missing 153 until something downstream depends on them and comes up short.",
      },
      { type: 'heading', text: 'The tradeoff worth naming' },
      {
        type: 'p',
        text: "Atomicity isn't free — a transaction holds its writes uncommitted until every operation in it succeeds, which means longer-held locks and, for a genuinely huge batch, a meaningfully bigger unit of work to roll back if something late in the list fails. For an import sized in the hundreds or low thousands of rows, that cost is trivial next to the alternative of a half-imported dataset nobody's certain about. For something in the millions of rows, chunking into smaller transactional batches is usually the better trade — all-or-nothing, just at a smaller granularity than \"the entire file.\"",
      },
    ],
  },
  {
    slug: 'even-our-404-page-is-a-pun',
    title: 'Even our 404 page is a pun',
    dek: "\"Not made.\" — the one page on the site nobody's supposed to end up on, and we still didn't skip the brand. Type a fake URL below.",
    tag: 'Design',
    accent: 'purple',
    date: '2027-03-07',
    readMinutes: 2,
    body: [
      {
        type: 'p',
        text: "A 404 page is the one place on a site where almost nobody puts real effort — by definition, every visitor there arrived by accident, following a broken link or a typo, and most templates just say \"Page Not Found\" in the default font and call it handled. Ours says \"Not made.\" instead, split into the same wireframe-outline-versus-solid-gradient treatment the wordmark carries everywhere else on the site.",
      },
      {
        type: 'statement',
        text: 'bothmade. Both made. Not made — the one state the brand mark was always going to eventually need to say out loud.',
      },
      { type: 'heading', text: 'Type a fake path' },
      { type: 'notFoundDemo' },
      {
        type: 'p',
        text: "That's the real not-found.tsx layout, verbatim — same grid backdrop, same font-mono \"error 404\" kicker, same two-tone treatment on the headline. The only thing swapped out is the browser chrome around it, so you can type whatever nonexistent path you want and watch the page insist it genuinely was never made, which happens to also be exactly true.",
      },
      { type: 'heading', text: "Why bother on a page almost nobody sees" },
      {
        type: 'p',
        text: "Precisely because almost nobody sees it, it's low-stakes enough to take a genuine swing at — no client is reviewing the 404 page in a proposal meeting, so it's one of the few places on a site where a small joke is pure upside. It's also a real (if minor) signal: a studio that bothered to make its own error page on-brand is a studio that probably didn't skip the boring parts of your project either.",
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
