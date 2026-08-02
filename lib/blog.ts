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
  | { type: 'processDemo'; phases: { num: string; title: string; tag: string }[] };

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
