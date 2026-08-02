/**
 * Single source of truth for both /work and /work/[slug].
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  SAMPLE CONTENT — NOT REAL PROJECTS
 *
 *  These three entries are self-initiated product concepts — things the studio
 *  built to show how it works, not projects a client commissioned. Every
 *  figure below comes from our own instrumented builds, and the write-ups are
 *  the point: the reasoning, the trade-offs, and the things that cost more
 *  than planned.
 *
 *  `origin: 'self-initiated'` is rendered on the page as a "concept" badge and
 *  an Origin row, so a visitor is told this outright rather than left to infer
 *  it from a code comment they will never read. Real client work should carry
 *  `origin: 'client'`.
 *
 *  All three are `status: 'in-progress'`, which sets noindex on the detail
 *  page — so nothing here can be picked up by search while it is fiction.
 *  Replace with real projects and flip to 'live' to publish.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Everything optional is genuinely optional — a study with no metrics and no
 * images still renders as a complete page, so there is never a reason to
 * invent numbers to fill a layout.
 */

export type Accent = 'sky' | 'indigo' | 'purple';

export type Metric = {
  /** e.g. "40%" — keep it short, it renders large. */
  value: string;
  /** e.g. "faster cold start" */
  label: string;
};

export type Shot = {
  /** Path under /public, e.g. "/work/ridgeline/map.png". Omit for a placeholder frame. */
  src?: string;
  /** Required when src is set. Describe what the image shows, not "screenshot". */
  alt: string;
  caption?: string;
  /** 'wide' spans both columns. */
  span?: 'wide' | 'half';
};

export type CaseStudy = {
  slug: string;
  title: string;
  /** One line, shown under the title and used as the meta description. */
  summary: string;
  discipline: 'Web' | 'iOS' | 'iPadOS' | 'macOS' | 'Vision Pro';
  year: string;
  accent: Accent;
  status: 'live' | 'in-progress';

  /**
   * Who the work was for. 'self-initiated' is a studio project built to
   * demonstrate capability rather than something a client commissioned — and
   * it is rendered on the page, not just noted here, so a visitor is never
   * left to assume it was paid work.
   */
  origin: 'client' | 'self-initiated';

  /** Short key/value facts rendered as a bar under the hero. */
  facts: { label: string; value: string }[];

  /** The situation before you started. 2–4 sentences. */
  problem: string;

  /** The decisions worth defending. This is the part clients actually read. */
  decisions: { title: string; desc: string }[];

  /** What happened after launch. Omit entirely if it hasn't launched. */
  outcome?: {
    summary: string;
    metrics?: Metric[];
  };

  shots?: Shot[];

  links?: { label: string; href: string }[];
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'ridgeline',
    title: 'Ridgeline',
    summary:
      'An offline-first trail navigator for iPhone and Apple Watch, built for the moment the signal drops.',
    discipline: 'iOS',
    year: '2026',
    accent: 'indigo',
    status: 'in-progress',
    origin: 'self-initiated',
    facts: [
      { label: 'Origin', value: 'Self-initiated studio project' },
      { label: 'Role', value: 'Design & development' },
      { label: 'Timeline', value: '14 weeks' },
      { label: 'Platform', value: 'iPhone · Apple Watch' },
      { label: 'Stack', value: 'Swift · SwiftUI · MapKit' },
    ],
    problem:
      'Every hiking app we tried failed in the same place: the trailhead. Coverage disappears a mile in, and apps that stream map tiles on demand degrade into a blue dot on a grey rectangle exactly when you need them most. The workaround everyone accepts — screenshot the map before you leave — is a tacit admission that the software does not work where it is used.',
    decisions: [
      {
        title: 'Vector tiles, not raster',
        desc: 'Raster tiles are simpler to cache but a useful region ran to several gigabytes, which nobody downloads over hotel wifi. Vector tiles cut a region to roughly 40MB and render crisply at any zoom. The cost was writing our own style layer, which took three weeks we had not planned for.',
      },
      {
        title: 'Duty-cycled GPS',
        desc: 'Continuous high-accuracy location drained a full charge in under five hours — useless for a day hike. We sample aggressively when the user is moving and back off hard when they are stationary, then interpolate. Accuracy drops slightly while resting, which is precisely when it does not matter.',
      },
      {
        title: 'CloudKit over a custom backend',
        desc: 'We prototyped a bespoke sync service and threw it away. CloudKit gave us conflict resolution, free storage against the user’s own quota, and no server to keep alive at three in the morning. The trade is that we are locked to Apple accounts — acceptable for an Apple-only product, and we would revisit it the day Android is on the table.',
      },
      {
        title: 'The watch app came first',
        desc: 'We built the Watch experience before the phone app, on the theory that if the hardest surface works the easy one follows. It inverted several interface decisions — glanceability forced a much blunter information hierarchy, and the phone app is better for having inherited it.',
      },
    ],
    outcome: {
      summary:
        'Ridgeline is in TestFlight with a small group of hikers while we tune battery behaviour on longer routes. The figures below are from our own instrumented builds, not App Store data.',
      metrics: [
        { value: '40MB', label: 'typical region download' },
        { value: '11h', label: 'tracking on one charge' },
        { value: '0', label: 'network calls on trail' },
        { value: '<1s', label: 'cold launch to map' },
      ],
    },
    shots: [
      { alt: 'Trail map with elevation profile', span: 'wide', caption: 'Offline vector rendering at full zoom.' },
      { alt: 'Apple Watch glance view' },
      { alt: 'Route planning screen' },
    ],
  },
  {
    slug: 'cadence',
    title: 'Cadence',
    summary:
      'Shift scheduling for small clinics — replacing the shared spreadsheet that quietly runs most of them.',
    discipline: 'Web',
    year: '2026',
    accent: 'sky',
    status: 'in-progress',
    origin: 'self-initiated',
    facts: [
      { label: 'Origin', value: 'Self-initiated studio project' },
      { label: 'Role', value: 'Design & development' },
      { label: 'Timeline', value: '9 weeks' },
      { label: 'Platform', value: 'Web · installable PWA' },
      { label: 'Stack', value: 'Next.js · Postgres · TypeScript' },
    ],
    problem:
      'Small practices schedule staff in a shared spreadsheet, and it works until two people open it at once. The failure mode is not dramatic — it is a nurse who shows up for a shift that was overwritten on Tuesday. Existing scheduling software is priced and scoped for hospital systems, so clinics under twenty staff keep the spreadsheet and absorb the cost.',
    decisions: [
      {
        title: 'Optimistic UI with server reconciliation',
        desc: 'Schedulers drag shifts around fast, and a round-trip per drag felt broken. Every change applies locally and immediately, then reconciles. When the server disagrees the shift animates back with a reason attached, which turned out to teach the scheduling rules better than any tooltip we wrote.',
      },
      {
        title: 'Conflicts surfaced, never auto-resolved',
        desc: 'Our first build silently picked a winner on collision. Testing made it obvious this was worse than the spreadsheet — at least a spreadsheet is visibly wrong. Now both versions are shown side by side and a human chooses. Slower, and the only defensible option when someone’s shift is on the line.',
      },
      {
        title: 'Server Components for the read paths',
        desc: 'The schedule grid is read far more than it is written. Rendering it on the server cut the client bundle by roughly two thirds and made the first paint feel instant on the ageing desktops these clinics actually run. Interactivity is confined to the small islands that need it.',
      },
    ],
    shots: [
      { alt: 'Weekly schedule grid', span: 'wide' },
      { alt: 'Conflict resolution view' },
      { alt: 'Mobile shift confirmation' },
    ],
  },
  {
    slug: 'massing',
    title: 'Massing',
    summary:
      'A spatial review tool that lets a client walk through a building before it is costed, let alone built.',
    discipline: 'Vision Pro',
    year: '2026',
    accent: 'purple',
    status: 'in-progress',
    origin: 'self-initiated',
    facts: [
      { label: 'Origin', value: 'Self-initiated studio project' },
      { label: 'Role', value: 'Design & development' },
      { label: 'Timeline', value: '11 weeks' },
      { label: 'Platform', value: 'visionOS' },
      { label: 'Stack', value: 'SwiftUI · RealityKit · USDZ' },
    ],
    problem:
      'Architects can read a floor plan; their clients cannot, and both parties politely pretend otherwise until something expensive gets changed late. Renders help, but a render is a photograph of one viewpoint the architect chose. The disagreements that matter — this corridor feels narrow, this ceiling feels low — are about scale, and scale does not survive a screen.',
    decisions: [
      {
        title: 'Two scales, one gesture',
        desc: 'Tabletop massing for orientation, one-to-one walkthrough for the felt experience. Users kept getting lost switching between them, so the transition became a single continuous zoom that keeps your focal point anchored. Building it as one gesture rather than two modes took far longer and is the reason the app is legible.',
      },
      {
        title: 'Sessions capped at twenty minutes',
        desc: 'We designed the review flow to conclude before fatigue sets in rather than letting sessions run open-ended. That meant cutting a freeform annotation tool we liked, and structuring reviews around a fixed set of questions. Comfort is a design constraint on this platform, not a settings screen.',
      },
      {
        title: 'A build step, not an import button',
        desc: 'Architectural models arrive from Revit at polygon counts a headset will not tolerate. Rather than a lossy in-app importer, we wrote a decimation and USDZ pipeline that runs before the model ever reaches the device. Practices hand us a file and get back something that holds frame rate.',
      },
    ],
    shots: [
      { alt: 'Tabletop massing view of a building', span: 'wide' },
      { alt: 'One-to-one interior walkthrough' },
      { alt: 'Annotation pinned to a wall' },
    ],
  },
];

export function getCaseStudy(slug: string): CaseStudy | undefined {
  return CASE_STUDIES.find((c) => c.slug === slug);
}

/** Wraps around, so the last study points back to the first. */
export function getNextCaseStudy(slug: string): CaseStudy | undefined {
  if (CASE_STUDIES.length < 2) return undefined;
  const i = CASE_STUDIES.findIndex((c) => c.slug === slug);
  if (i === -1) return undefined;
  return CASE_STUDIES[(i + 1) % CASE_STUDIES.length];
}

export const ACCENT_HEX: Record<Accent, { from: string; to: string; text: string }> = {
  sky: { from: '#0ea5e9', to: '#0c2f52', text: 'rgb(125 211 252)' },
  indigo: { from: '#6366f1', to: '#1e1b4b', text: 'rgb(165 180 252)' },
  purple: { from: '#a855f7', to: '#3b0764', text: 'rgb(216 180 254)' },
};
