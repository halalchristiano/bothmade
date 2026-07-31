/**
 * The estimator's single source of truth.
 *
 * Everything the /start page shows, and everything the API recomputes when a
 * brief arrives, comes from this file. That is deliberate: a price the client
 * saw and a price we email ourselves must never be able to disagree, and the
 * only way to guarantee that is to have one catalogue and one `estimate()`.
 *
 * TO CHANGE PRICES: edit the numbers here. Nothing else in the codebase
 * hard-codes a figure. Amounts are whole US dollars.
 *
 * The pricing philosophy this encodes, so future edits don't fight it:
 *
 *   1. A base covers a real, shippable thing — not a stripped shell that
 *      forces add-ons. Someone who buys the base alone still gets a product.
 *   2. Every add-on is a literal, exact dollar amount. The number on the box
 *      is precisely what joins the total; no hidden multiplier touches it.
 *   3. The two things that DO scale — who the client is, and how fast they
 *      need it — are shown as their own explicit line items, in dollars, with
 *      the percentage stated. Overhead we can't itemise gets named, not
 *      buried in the base.
 *   4. Recurring care is quoted separately and never folded into the one-time
 *      total. Mixing them is how agencies make a number look smaller.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type ProjectId = 'site' | 'ios' | 'mac' | 'vision' | 'both';
export type ClientTypeId = 'founder' | 'smb' | 'funded' | 'enterprise' | 'nonprofit';
export type TimelineId = 'standard' | 'rush' | 'flexible';
export type CarePlanId = 'none' | 'essential' | 'growth' | 'partner';

export type Project = {
  id: ProjectId;
  name: string;
  /** One line under the title — what this actually is. */
  blurb: string;
  base: number;
  /** Everything the base already buys. Shown so the base reads as a product. */
  includes: string[];
  /** Optional flag ribbon, e.g. the bundle saving. */
  badge?: string;
};

export type AddOn = {
  id: string;
  name: string;
  desc: string;
  /** Price per unit. For toggles, the whole price. */
  price: number;
  /** Present on quantity add-ons (extra pages, extra languages…). */
  unit?: { label: string; plural: string; max: number };
  /** Narrows a group-level match to specific projects. */
  only?: ProjectId[];
};

export type AddOnGroup = {
  id: string;
  name: string;
  /** Why this group exists, in the client's language. */
  note: string;
  appliesTo: ProjectId[];
  /** Group is hidden unless the client is one of these types. */
  onlyForClients?: ClientTypeId[];
  items: AddOn[];
};

export type ClientType = {
  id: ClientTypeId;
  name: string;
  /** The honest reason the multiplier is what it is. Shown on the card. */
  blurb: string;
  multiplier: number;
};

export type Timeline = {
  id: TimelineId;
  name: string;
  blurb: string;
  multiplier: number;
};

export type CarePlan = {
  id: CarePlanId;
  name: string;
  blurb: string;
  monthly: number;
};

/** What the client has chosen so far. Quantities are keyed by add-on id. */
export type Selection = {
  project: ProjectId | null;
  client: ClientTypeId | null;
  addOns: Record<string, number>;
  timeline: TimelineId;
  care: CarePlanId;
};

export const EMPTY_SELECTION: Selection = {
  project: null,
  client: null,
  addOns: {},
  timeline: 'standard',
  care: 'none',
};

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

export const PROJECTS: Project[] = [
  {
    id: 'site',
    name: 'Website',
    blurb: 'Marketing site, SaaS front end, or storefront.',
    base: 4500,
    includes: [
      'Up to 5 pages, designed from scratch',
      'Responsive down to the smallest phone',
      'Sub-two-second loads, SEO-ready markup',
      'Deployed, live, and handed over',
    ],
  },
  {
    id: 'ios',
    name: 'iOS & iPad app',
    blurb: 'A native app on the App Store.',
    base: 12000,
    includes: [
      'Up to 6 core screens, native SwiftUI',
      'Design system and app icon',
      'TestFlight beta with your testers',
      'Submitted to the App Store, review handled',
    ],
  },
  {
    id: 'mac',
    name: 'macOS app',
    blurb: 'Desktop software that respects the platform.',
    base: 11000,
    includes: [
      'Up to 6 core screens, native SwiftUI/AppKit',
      'Menu-bar utility or full window app',
      'Signed and notarised by Apple',
      'Direct download or Mac App Store',
    ],
  },
  {
    id: 'vision',
    name: 'Vision Pro app',
    blurb: 'Spatial computing, on the platform almost nobody has shipped on.',
    base: 14000,
    includes: [
      'Up to 4 spatial scenes, native visionOS',
      'RealityKit scene and materials setup',
      'TestFlight beta on-device',
      'Submitted to the App Store, review handled',
    ],
  },
  {
    id: 'both',
    name: 'Website + iOS app + one backend',
    blurb: 'The flagship. One product, alive on every screen.',
    base: 15500,
    badge: 'Saves $1,000 against booking the two separately',
    includes: [
      'Everything in the Website build',
      'Everything in the iOS & iPad build',
      'One shared backend and one design system',
      'One team across both — no handoff, no drift',
    ],
  },
];

/**
 * Client type is the part people assume is a markup on the customer. It isn't.
 * It's the shape of the work: a solo founder answers a question in an hour, an
 * enterprise routes it through legal and security for three weeks, and that
 * time is real engineering time. Stating the percentage on the card is the
 * whole point — a client who disagrees with the reason can argue with it.
 */
export const CLIENT_TYPES: ClientType[] = [
  {
    id: 'founder',
    name: 'Solo founder / pre-launch',
    blurb: 'One decision-maker, fast answers, nothing to unpick.',
    multiplier: 1,
  },
  {
    id: 'smb',
    name: 'Small business',
    blurb: 'Established, straightforward sign-off, existing brand to respect.',
    multiplier: 1,
  },
  {
    id: 'funded',
    name: 'Funded startup',
    blurb: 'Investor timelines, a board to satisfy, more review cycles.',
    multiplier: 1.15,
  },
  {
    id: 'enterprise',
    name: 'Established company',
    blurb: 'Procurement, legal, security review, longer approval chains.',
    multiplier: 1.35,
  },
  {
    id: 'nonprofit',
    name: 'Non-profit / education',
    blurb: 'Discounted. We keep room for work that matters.',
    multiplier: 0.85,
  },
];

export const ADD_ON_GROUPS: AddOnGroup[] = [
  {
    id: 'web',
    name: 'The website',
    note: 'Anything past a five-page site.',
    appliesTo: ['site', 'both'],
    items: [
      {
        id: 'pages',
        name: 'Extra pages',
        desc: 'Beyond the five in the base build.',
        price: 350,
        unit: { label: 'page', plural: 'pages', max: 20 },
      },
      {
        id: 'cms',
        name: 'Edit your own content',
        desc: 'A CMS, so copy and images change without booking us.',
        price: 1500,
      },
      {
        id: 'blog',
        name: 'Blog or journal',
        desc: 'Article templates, categories, RSS, share cards.',
        price: 700,
      },
      {
        id: 'ecommerce',
        name: 'Store & checkout',
        desc: 'Products, cart, payment, inventory, shipping rules.',
        price: 3200,
      },
      {
        id: 'booking',
        name: 'Booking & scheduling',
        desc: 'Availability, calendar sync, confirmations, reminders.',
        price: 1600,
      },
      {
        id: 'i18n',
        name: 'Extra languages',
        desc: 'Full translation plumbing, per language beyond English.',
        price: 900,
        unit: { label: 'language', plural: 'languages', max: 6 },
      },
      {
        id: 'motion',
        name: 'Motion & interaction pass',
        desc: 'Scroll choreography and micro-interactions, like this site has.',
        price: 1500,
      },
      {
        id: 'illustration',
        name: 'Custom illustration or 3D',
        desc: 'Original artwork instead of stock. Priced for a small set.',
        price: 1800,
      },
    ],
  },
  {
    id: 'app',
    name: 'The app',
    note: 'Native capabilities past the six core screens.',
    appliesTo: ['ios', 'mac', 'vision', 'both'],
    items: [
      {
        id: 'screens',
        name: 'Extra screens',
        desc: 'Beyond the core screens in the base build.',
        price: 900,
        unit: { label: 'screen', plural: 'screens', max: 20 },
      },
      {
        id: 'push',
        name: 'Push notifications',
        desc: 'Delivery infrastructure, permissions, deep links into the app.',
        price: 900,
      },
      {
        id: 'iap',
        name: 'In-app purchases & subscriptions',
        desc: 'StoreKit, receipts, restore, free trials, paywall.',
        price: 1800,
      },
      {
        id: 'offline',
        name: 'Offline mode & sync',
        desc: 'Works on a plane, reconciles cleanly when the signal returns.',
        price: 2200,
      },
      {
        id: 'widgets',
        name: 'Widgets & Live Activities',
        desc: 'Home Screen, Lock Screen, Dynamic Island.',
        price: 1200,
        only: ['ios', 'both'],
      },
      {
        id: 'ipad',
        name: 'iPad-optimised layouts',
        desc: 'A real iPad app, not a stretched phone screen.',
        price: 1600,
        only: ['ios', 'both'],
      },
      {
        id: 'watch',
        name: 'Apple Watch companion',
        desc: 'A paired watchOS app with its own complications.',
        price: 3500,
        only: ['ios', 'both'],
      },
      {
        id: 'devicekit',
        name: 'Device capabilities',
        desc: 'Camera, maps, location, health, files — wired in properly.',
        price: 1400,
      },
      {
        id: 'realtime',
        name: 'Real-time or multiplayer',
        desc: 'Live presence, shared state, conflict resolution.',
        price: 3800,
      },
    ],
  },
  {
    id: 'platform',
    name: 'Accounts, data & backend',
    note: 'The unglamorous plumbing. Priced honestly because it is most of the work.',
    appliesTo: ['site', 'ios', 'mac', 'vision', 'both'],
    items: [
      {
        id: 'accounts',
        name: 'User accounts & sign-in',
        desc: 'Sign-up, sessions, password reset, Sign in with Apple.',
        price: 2400,
      },
      {
        id: 'backend',
        name: 'Custom backend & database',
        desc: 'Your own API and data model, not a rented no-code box.',
        price: 3500,
        // The flagship build already includes one shared backend.
        only: ['site', 'ios', 'mac', 'vision'],
      },
      {
        id: 'payments',
        name: 'Payments & subscriptions',
        desc: 'Stripe, plans, invoices, failed-payment recovery.',
        price: 1900,
      },
      {
        id: 'admin',
        name: 'Admin dashboard for your team',
        desc: 'The internal tool you will need by month two.',
        price: 2800,
      },
      {
        id: 'integrations',
        name: 'Third-party integrations',
        desc: 'Whatever you already run on — CRM, Slack, ERP, logistics.',
        price: 900,
        unit: { label: 'integration', plural: 'integrations', max: 8 },
      },
      {
        id: 'ai',
        name: 'AI features',
        desc: 'Search, chat, or generation wired to a real model — not a demo.',
        price: 2600,
      },
    ],
  },
  {
    id: 'launch',
    name: 'Content & launch',
    note: 'The things that decide whether anyone finds it.',
    appliesTo: ['site', 'ios', 'mac', 'vision', 'both'],
    items: [
      {
        id: 'copy',
        name: 'Copywriting',
        desc: 'We write it. Most projects stall here otherwise.',
        price: 1200,
      },
      {
        id: 'brand',
        name: 'Logo & brand basics',
        desc: 'Mark, type, colour, and a one-page guide to using them.',
        price: 2200,
      },
      {
        id: 'seo',
        name: 'SEO & analytics setup',
        desc: 'Structured data, sitemaps, and numbers you can act on.',
        price: 800,
      },
      {
        id: 'email',
        name: 'Email automation',
        desc: 'Welcome, receipts, win-backs — designed and wired up.',
        price: 700,
      },
      {
        id: 'a11y',
        name: 'Accessibility audit',
        desc: 'WCAG 2.2 AA pass with a written report and the fixes made.',
        price: 1400,
      },
      {
        id: 'migration',
        name: 'Migrate what you have',
        desc: 'Content, users, orders, and redirects off the old thing.',
        price: 1100,
      },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise requirements',
    note: 'Shown because of who you told us you are. Skip anything you do not need.',
    appliesTo: ['site', 'ios', 'mac', 'vision', 'both'],
    onlyForClients: ['funded', 'enterprise'],
    items: [
      {
        id: 'sso',
        name: 'SSO / SAML',
        desc: 'Okta, Entra, Google Workspace. Provisioning included.',
        price: 3200,
      },
      {
        id: 'security',
        name: 'Security review & pen-test support',
        desc: 'We answer your security team, and fix what they find.',
        price: 2600,
      },
      {
        id: 'compliance',
        name: 'Compliance documentation',
        desc: 'Evidence and controls for a SOC 2 or HIPAA process.',
        price: 2900,
      },
      {
        id: 'procurement',
        name: 'Custom contract & procurement',
        desc: 'Your paper, your vendor forms, your legal cycle.',
        price: 1200,
      },
    ],
  },
];

export const TIMELINES: Timeline[] = [
  {
    id: 'standard',
    name: 'Standard',
    blurb: '8–12 weeks. Our normal pace, and the one that produces our best work.',
    multiplier: 1,
  },
  {
    id: 'rush',
    name: 'Rush',
    blurb: 'Under 6 weeks. We clear other work and add hands to hit it.',
    multiplier: 1.25,
  },
  {
    id: 'flexible',
    name: 'Flexible',
    blurb: 'No fixed date. We slot it between other builds, and you pay less for the patience.',
    multiplier: 0.9,
  },
];

export const CARE_PLANS: CarePlan[] = [
  {
    id: 'none',
    name: 'No plan',
    blurb: 'We hand over every key and you take it from there. Always an option.',
    monthly: 0,
  },
  {
    id: 'essential',
    name: 'Essential',
    blurb: 'Hosting, monitoring, security updates, and small fixes.',
    monthly: 450,
  },
  {
    id: 'growth',
    name: 'Growth',
    blurb: 'Essential, plus a monthly iteration cycle and an analytics review.',
    monthly: 1200,
  },
  {
    id: 'partner',
    name: 'Partner',
    blurb: 'An embedded team. Priority roadmap, weekly shipping, a direct line.',
    monthly: 2800,
  },
];

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

export const getProject = (id: ProjectId | null) =>
  PROJECTS.find((p) => p.id === id) ?? null;

export const getClientType = (id: ClientTypeId | null) =>
  CLIENT_TYPES.find((c) => c.id === id) ?? null;

export const getTimeline = (id: TimelineId) =>
  TIMELINES.find((t) => t.id === id) ?? TIMELINES[0];

export const getCarePlan = (id: CarePlanId) =>
  CARE_PLANS.find((c) => c.id === id) ?? CARE_PLANS[0];

/**
 * Which groups a given client should be looking at. Showing an SSO line to a
 * solo founder is noise; hiding the website group from an app-only build is
 * the difference between a form people finish and one they abandon.
 */
export function visibleGroups(
  project: ProjectId | null,
  client: ClientTypeId | null
): AddOnGroup[] {
  if (!project) return [];

  return ADD_ON_GROUPS.filter(
    (g) =>
      g.appliesTo.includes(project) &&
      (!g.onlyForClients || (client !== null && g.onlyForClients.includes(client)))
  )
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.only || i.only.includes(project)),
    }))
    .filter((g) => g.items.length > 0);
}

/** Every add-on id the current selection is allowed to contain. */
export function allowedAddOnIds(
  project: ProjectId | null,
  client: ClientTypeId | null
): Set<string> {
  return new Set(visibleGroups(project, client).flatMap((g) => g.items.map((i) => i.id)));
}

/**
 * Drops choices that no longer apply — someone who picks e-commerce, then
 * switches from Website to iOS app, must not keep paying for a checkout that
 * is no longer on the table.
 */
export function pruneAddOns(
  addOns: Record<string, number>,
  project: ProjectId | null,
  client: ClientTypeId | null
): Record<string, number> {
  const allowed = allowedAddOnIds(project, client);
  const next: Record<string, number> = {};

  for (const [id, qty] of Object.entries(addOns)) {
    if (allowed.has(id) && qty > 0) next[id] = qty;
  }

  return next;
}

/* ------------------------------------------------------------------ *
 * The estimate
 * ------------------------------------------------------------------ */

export type LineItem = {
  id: string;
  label: string;
  /** e.g. "3 × $350" on quantity add-ons; the percentage on adjustments. */
  detail?: string;
  amount: number;
};

export type Estimate = {
  /** Null until a project is chosen — there is nothing honest to show before that. */
  base: LineItem | null;
  addOns: LineItem[];
  /** base + add-ons, before the two stated adjustments. */
  subtotal: number;
  clientAdjustment: LineItem | null;
  timelineAdjustment: LineItem | null;
  total: number;
  /** Recurring, deliberately kept out of `total`. */
  monthly: LineItem | null;
  /** True once there is enough to quote at all. */
  ready: boolean;
};

/** Estimates are not invoices. Nothing lands on an awkward $4,637. */
const roundTo50 = (n: number) => Math.round(n / 50) * 50;

/**
 * The whole calculation, in one pure function so the page and the API can
 * never drift. Order matters and is chosen to keep the on-screen arithmetic
 * checkable by hand:
 *
 *   subtotal  = base + every add-on at its literal sticker price
 *   client    = subtotal × (multiplier − 1)      ← its own line, in dollars
 *   timeline  = (subtotal + client) × (multiplier − 1)
 *   total     = subtotal + client + timeline
 *
 * Timeline compounds on the adjusted figure because a rush costs more on a
 * harder project — that is the one place the maths is not purely additive, and
 * the breakdown shows the number it was taken from.
 */
export function estimate(selection: Selection): Estimate {
  const project = getProject(selection.project);
  const client = getClientType(selection.client);
  const timeline = getTimeline(selection.timeline);
  const care = getCarePlan(selection.care);

  const monthly: LineItem | null =
    care.monthly > 0
      ? { id: `care:${care.id}`, label: `${care.name} care plan`, amount: care.monthly }
      : null;

  if (!project) {
    return {
      base: null,
      addOns: [],
      subtotal: 0,
      clientAdjustment: null,
      timelineAdjustment: null,
      total: 0,
      monthly,
      ready: false,
    };
  }

  const base: LineItem = {
    id: `project:${project.id}`,
    label: project.name,
    detail: 'base build',
    amount: project.base,
  };

  const allowed = visibleGroups(project.id, client?.id ?? null).flatMap((g) => g.items);

  const addOns: LineItem[] = [];
  for (const item of allowed) {
    const qty = selection.addOns[item.id] ?? 0;
    if (qty <= 0) continue;

    const capped = item.unit ? Math.min(qty, item.unit.max) : 1;

    addOns.push({
      id: item.id,
      label: item.unit
        ? `${item.name} — ${capped} ${capped === 1 ? item.unit.label : item.unit.plural}`
        : item.name,
      detail: item.unit ? `${capped} × ${formatMoney(item.price)}` : undefined,
      amount: item.price * capped,
    });
  }

  const subtotal = base.amount + addOns.reduce((sum, a) => sum + a.amount, 0);

  const clientAdjustment: LineItem | null =
    client && client.multiplier !== 1
      ? {
          id: `client:${client.id}`,
          label: client.name,
          detail: percentLabel(client.multiplier),
          amount: roundTo50(subtotal * (client.multiplier - 1)),
        }
      : null;

  const afterClient = subtotal + (clientAdjustment?.amount ?? 0);

  const timelineAdjustment: LineItem | null =
    timeline.multiplier !== 1
      ? {
          id: `timeline:${timeline.id}`,
          label: `${timeline.name} timeline`,
          detail: percentLabel(timeline.multiplier),
          amount: roundTo50(afterClient * (timeline.multiplier - 1)),
        }
      : null;

  return {
    base,
    addOns,
    subtotal,
    clientAdjustment,
    timelineAdjustment,
    total: afterClient + (timelineAdjustment?.amount ?? 0),
    monthly,
    // A quote needs both halves: what we're building, and who we're building
    // it for. Without the client type the adjustment line is a guess.
    ready: Boolean(project && client),
  };
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/** `$4,500`. Whole dollars — cents on an estimate are a false precision. */
export function formatMoney(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  return `${sign}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
}

/** `+$1,200` / `−$450`, for anything that joins a running total. */
export function formatDelta(amount: number): string {
  if (amount === 0) return 'No change';
  return amount > 0 ? `+${formatMoney(amount)}` : formatMoney(amount);
}

/** `+15%` / `−10%` from a multiplier. */
export function percentLabel(multiplier: number): string {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct === 0) return 'No adjustment';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/**
 * A one-line plain-text rendering of the whole estimate. Used in the emails,
 * where a table would be one more thing to break in a mail client.
 */
export function estimateToLines(est: Estimate): string[] {
  const lines: string[] = [];

  if (est.base) lines.push(`${est.base.label} (base build): ${formatMoney(est.base.amount)}`);
  for (const a of est.addOns) lines.push(`${a.label}: ${formatDelta(a.amount)}`);
  if (est.clientAdjustment)
    lines.push(
      `${est.clientAdjustment.label} (${est.clientAdjustment.detail}): ${formatDelta(est.clientAdjustment.amount)}`
    );
  if (est.timelineAdjustment)
    lines.push(
      `${est.timelineAdjustment.label} (${est.timelineAdjustment.detail}): ${formatDelta(est.timelineAdjustment.amount)}`
    );

  lines.push(`ESTIMATE TOTAL: ${formatMoney(est.total)}`);

  if (est.monthly) lines.push(`Then ${formatMoney(est.monthly.amount)}/month — ${est.monthly.label}`);

  return lines;
}
