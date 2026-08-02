// Pricing model for the /start calculator, Stripe checkout, and Project records.
// All prices are in cents (USD), matching Project.basePrice / Project.totalPrice.

import { PAIN_POINTS, type PainPointKey } from '@/lib/leads';

export type BaseService =
  | 'website'
  | 'web-app'
  | 'ios-app'
  | 'macos-app'
  | 'visionos'
  | 'multi';

export type AddOnKey =
  // Content & growth
  | 'seo'
  | 'analytics'
  | 'copywriting'
  | 'cms'
  | 'blog'
  | 'multilingual'
  | 'email-marketing'
  | 'local-seo'
  // Commerce & bookings
  | 'ecommerce'
  | 'booking'
  | 'subscriptions'
  // Design & motion
  | 'illustrations'
  | 'animations'
  | 'threed'
  | 'brand-identity'
  // Backend & integrations
  | 'custom-backend'
  | 'integrations'
  | 'crm-setup'
  | 'admin-dashboard'
  | 'user-accounts'
  | 'push-notifications'
  | 'live-chat'
  | 'app-store-submission'
  | 'data-migration'
  // Accessibility & compliance
  | 'accessibility-audit'
  | 'privacy-compliance'
  | 'sso-auth'
  // Ongoing care (recurring — first month included in price)
  | 'maintenance'
  | 'growth-plan'
  | 'hosting'
  | 'onboarding-retainer'
  | 'sla-uptime'
  // Growth & conversion (new)
  | 'video-content'
  | 'cro-testing'
  | 'public-api'
  | 'white-label'
  | 'performance-optimization'
  | 'reporting-export'
  // Tiered upgrades — same underlying add-on, more of it
  | 'local-seo-multi'
  | 'multilingual-plus'
  | 'data-migration-large';

export type AddOnCategory =
  | 'content-growth'
  | 'commerce-bookings'
  | 'design-motion'
  | 'backend-integrations'
  | 'accessibility-compliance'
  | 'ongoing-care'
  | 'growth-conversion';

export type ClientType = 'startup' | 'smb' | 'enterprise';

export type TimelineKey = 'flexible' | 'standard' | 'rush';

export const BASE_SERVICES: Record<
  BaseService,
  { label: string; description: string; bestFor: string; price: number }
> = {
  website: {
    label: 'Website',
    description: 'A site people visit to read, look, and get in touch — no accounts, no logging in, nothing to "use."',
    bestFor: 'Marketing sites, portfolios, restaurants, landing pages, storefronts. If a visitor never needs to log in, this is you.',
    price: 300000,
  },
  'web-app': {
    label: 'Web App',
    description: 'A tool people log into and actually use — their own account, their own data, real functionality that does something. Includes the backend and user accounts needed to make that work, so you won\'t also be charged for those as separate add-ons.',
    bestFor: 'Dashboards, booking systems, internal tools, anything with user accounts, saved data, or logic beyond "here\'s some information."',
    price: 800000,
  },
  'ios-app': {
    label: 'iOS App',
    description: 'A native iPhone and iPad app, downloaded from the App Store.',
    bestFor: 'Anything that needs to live on someone\'s home screen, use the camera/notifications/offline storage, or just feel native on iPhone.',
    price: 1000000,
  },
  'macos-app': {
    label: 'macOS App',
    description: 'A native Mac app, distributed outside or through the Mac App Store.',
    bestFor: 'Desktop tools that need deep OS integration — menu bar apps, file system access, background processes.',
    price: 1000000,
  },
  visionos: {
    label: 'Vision Pro App',
    description: 'A native visionOS spatial computing app for Apple Vision Pro.',
    bestFor: 'Spatial/3D experiences that only make sense in a headset — not a port of an existing app.',
    price: 1500000,
  },
  multi: {
    label: 'Multi-Platform',
    description: 'Two or more of the above, built together as one system with shared design and backend.',
    bestFor: 'You need, say, a web app AND an iOS app that share the same accounts and data.',
    price: 2000000,
  },
};

export const ADD_ON_CATEGORIES: Record<AddOnCategory, { label: string }> = {
  'content-growth': { label: 'Content & Growth' },
  'commerce-bookings': { label: 'Commerce & Bookings' },
  'design-motion': { label: 'Design & Motion' },
  'backend-integrations': { label: 'Backend & Integrations' },
  'accessibility-compliance': { label: 'Accessibility & Compliance' },
  'ongoing-care': { label: 'Ongoing Care (recurring)' },
  'growth-conversion': { label: 'Growth & Conversion' },
};

export const ADD_ONS: Record<
  AddOnKey,
  { label: string; description: string; benefit: string; price: number; category: AddOnCategory }
> = {
  // Content & growth
  seo: {
    label: 'SEO Setup',
    benefit:
      "You get found by people already searching for what you do — the ones ready to buy, arriving without you paying per click.",
    description: 'Technical SEO, metadata, and search console setup.',
    price: 75000,
    category: 'content-growth',
  },
  analytics: {
    label: 'Analytics',
    benefit:
      "You stop guessing which marketing works. Most people cut the thing that was working and keep paying for the thing that wasn't.",
    description: 'Event tracking and a reporting dashboard.',
    price: 50000,
    category: 'content-growth',
  },
  copywriting: {
    label: 'Professional Copywriting',
    benefit:
      "More of the visitors you already have get in touch, because the words speak to what they're actually worried about.",
    description: 'Website and product copy written for you, not just placeholder text.',
    price: 90000,
    category: 'content-growth',
  },
  cms: {
    label: 'Content Management System',
    benefit:
      "You change your own prices, photos and pages in minutes, instead of waiting on a developer and paying for it.",
    description: 'Edit pages, images, and copy yourself without touching code.',
    price: 120000,
    category: 'content-growth',
  },
  blog: {
    label: 'Blog / Articles',
    benefit:
      "You show up for the questions your customers type into Google long before they're ready to buy.",
    description: 'A blog section with categories, tags, and RSS.',
    price: 60000,
    category: 'content-growth',
  },
  multilingual: {
    label: 'Multi-language Support',
    benefit:
      "You stop being invisible to customers who don't read English first — usually a market your competitors ignore.",
    description: 'Translated content and language switching for a second language.',
    price: 80000,
    category: 'content-growth',
  },
  'multilingual-plus': {
    label: 'Additional Languages (3-5 total)',
    benefit:
      "You cover every market you actually sell into instead of just the one that was easiest to translate first.",
    description: 'Translation and language switching for up to three more languages beyond the second, priced as an increment above the base Multi-language Support add-on.',
    price: 140000,
    category: 'content-growth',
  },
  'email-marketing': {
    label: 'Email Marketing Setup',
    benefit:
      "The people who didn't buy today hear from you again, so you're who they remember when they're ready.",
    description: 'Klaviyo/Mailchimp integration with a welcome flow and abandoned-cart or lead-nurture sequences.',
    price: 85000,
    category: 'content-growth',
  },
  'local-seo': {
    label: 'Local SEO & Google Business Profile',
    benefit:
      "You appear in the map results when someone nearby searches. That's the highest-intent customer there is.",
    description: 'Google Business Profile setup, local listings, and map-pack optimization for businesses that rely on nearby customers finding them. Covers a single location.',
    price: 55000,
    category: 'content-growth',
  },
  'local-seo-multi': {
    label: 'Multi-Location Local SEO (2-5 locations)',
    benefit:
      "Every location shows up in its own neighborhood's map results, instead of your other branches competing with each other or only your flagship location ranking.",
    description: 'Local SEO setup and Google Business Profile management across up to 5 locations, priced as an increment above the single-location plan.',
    price: 150000,
    category: 'content-growth',
  },

  // Commerce & bookings
  ecommerce: {
    label: 'E-commerce & Payments',
    benefit:
      "You can sell without a person involved, so your sales stop being capped by how many calls your team can answer.",
    description: 'Product catalog, cart, and checkout — Stripe or your platform of choice.',
    price: 250000,
    category: 'commerce-bookings',
  },
  booking: {
    label: 'Appointments & Booking',
    benefit:
      "Someone deciding at 9pm can book you at 9pm. Right now they ring the next name on the list instead.",
    description: 'Calendar scheduling so customers can book time with you directly.',
    price: 150000,
    category: 'commerce-bookings',
  },
  subscriptions: {
    label: 'Subscriptions & Memberships',
    benefit:
      "One-off customers become monthly income — worth several times more each, and it's what makes a quiet month survivable.",
    description: 'Recurring billing, member accounts, and gated content.',
    price: 220000,
    category: 'commerce-bookings',
  },

  // Design & motion
  illustrations: {
    label: 'Custom Illustrations & Icons',
    benefit:
      "You look like a business with its own identity rather than one using the same stock photos as everyone else.",
    description: 'Original artwork and iconography instead of stock assets.',
    price: 70000,
    category: 'design-motion',
  },
  animations: {
    label: 'High-End Animations',
    benefit:
      "The site feels considered rather than templated, which is most of what people mean when they say a brand feels premium.",
    description: 'Scroll-driven motion, micro-interactions, the details that make it feel alive.',
    price: 140000,
    category: 'design-motion',
  },
  threed: {
    label: '3D / WebGL Visuals',
    benefit:
      "Customers can examine the product properly before buying, which cuts both hesitation and returns.",
    description: 'Interactive 3D scenes or product visualizations.',
    price: 200000,
    category: 'design-motion',
  },
  'brand-identity': {
    label: 'Brand Identity',
    benefit:
      "You stop getting haggled on price. Looking inconsistent is why people assume you're cheap.",
    description: 'Logo, color system, and typography — a full visual identity, not just a website.',
    price: 180000,
    category: 'design-motion',
  },

  // Backend & integrations
  'custom-backend': {
    label: 'Custom Backend / API',
    benefit:
      "The software fits how you actually work, instead of you reshaping the business around what an off-the-shelf tool allows.",
    description: 'A purpose-built backend for logic that off-the-shelf tools can\'t handle. Already included if you picked Web App — this is for bolting real backend logic onto an otherwise simple Website or native app.',
    price: 300000,
    category: 'backend-integrations',
  },
  integrations: {
    label: 'Third-Party Integrations',
    benefit:
      "Information stops being typed into two places, so the numbers stop disagreeing and nobody has to reconcile them.",
    description: 'Connect to your CRM, Slack, Zapier, or other tools you already run on.',
    price: 100000,
    category: 'backend-integrations',
  },
  'crm-setup': {
    label: 'CRM & Lead Capture Setup',
    benefit:
      "No enquiry gets lost in somebody's inbox. Following up stops depending on whoever happens to remember.",
    description: 'Wire your site\'s forms into HubSpot, Salesforce, or a sheet/Zapier pipeline so leads land somewhere you actually work from.',
    price: 65000,
    category: 'backend-integrations',
  },
  'admin-dashboard': {
    label: 'Admin Dashboard',
    benefit:
      "Your team manages the day-to-day themselves, without a developer in the loop for routine changes.",
    description: 'An internal tool for your team to manage data without touching the database.',
    price: 220000,
    category: 'backend-integrations',
  },
  'user-accounts': {
    label: 'User Accounts & Auth',
    benefit:
      "Customers get their own space with their own data — the thing that turns a website into something people come back to.",
    description: 'Sign-up, login, and per-user data. Already included if you picked Web App — this is for adding accounts to an otherwise simple Website or native app.',
    price: 150000,
    category: 'backend-integrations',
  },
  'sso-auth': {
    label: 'SSO & Enterprise Access Control',
    benefit:
      "Your enterprise buyers can actually adopt it, because their IT department requires single sign-on and role-based access before anyone's allowed to log in.",
    description: 'Single sign-on (Google/Microsoft/Okta/SAML) and role-based permissions on top of standard user accounts.',
    price: 130000,
    category: 'backend-integrations',
  },
  'public-api': {
    label: 'Public API for Developers',
    benefit:
      "Your customers can build on top of you instead of asking you for one-off integrations forever — that's what turns a product into a platform.",
    description: 'A documented, authenticated API surface so external developers or partners can integrate with your product.',
    price: 180000,
    category: 'backend-integrations',
  },
  'white-label': {
    label: 'White-Label / Multi-Tenant Setup',
    benefit:
      "You can resell the same product under different brands or to different customer organizations without building it again for each one.",
    description: 'Per-tenant branding, data isolation, and configuration so the same build can be sold to multiple customers or under multiple brands.',
    price: 350000,
    category: 'backend-integrations',
  },
  'push-notifications': {
    label: 'Push Notifications',
    benefit:
      "You can reach customers directly on their phone, without paying a platform for the privilege.",
    description: 'Re-engage users with native push, web push, or both.',
    price: 90000,
    category: 'backend-integrations',
  },
  'live-chat': {
    label: 'Live Chat Widget',
    benefit:
      "You catch the people who have one question standing between them and buying, at the moment they have it.",
    description: 'Real-time chat support built into your product.',
    price: 70000,
    category: 'backend-integrations',
  },
  'app-store-submission': {
    label: 'App Store Submission & Optimization',
    benefit:
      "You end up actually live on the App Store. Rejections are common and handling them is a job in itself.",
    description: 'App Store / TestFlight setup, listing copy and screenshots, and handling the actual submission and review process.',
    price: 45000,
    category: 'backend-integrations',
  },
  'data-migration': {
    label: 'Content & Data Migration',
    benefit:
      "You keep your existing content, customers and search rankings instead of starting from zero on launch day.",
    description: 'Import your existing site\'s pages, products, or customer data instead of starting from a blank slate. Covers typical small-to-medium datasets.',
    price: 75000,
    category: 'backend-integrations',
  },
  'data-migration-large': {
    label: 'Large-Scale Data Migration (10k+ records)',
    benefit:
      "Nothing gets silently dropped or corrupted when your dataset is too big for a manual once-over — someone actually validates it at that scale.",
    description: 'Migration tooling, validation, and cleanup for datasets beyond what the standard Content & Data Migration add-on covers, priced as an increment above it.',
    price: 160000,
    category: 'backend-integrations',
  },

  // Accessibility & compliance
  'accessibility-audit': {
    label: 'Accessibility Audit (WCAG)',
    benefit:
      "More people can use your site, and you're covered on a requirement larger and public-sector buyers increasingly ask about.",
    description: 'A full accessibility pass so your product works for everyone.',
    price: 60000,
    category: 'accessibility-compliance',
  },
  'privacy-compliance': {
    label: 'Privacy & Compliance Setup',
    benefit:
      "Handled properly before it matters. It's cheap now and expensive after something goes wrong.",
    description: 'Cookie consent, privacy policy wiring, and GDPR/CCPA-friendly data handling.',
    price: 50000,
    category: 'accessibility-compliance',
  },

  // Ongoing care (recurring)
  maintenance: {
    label: 'Maintenance Plan',
    benefit:
      "Your site doesn't quietly decay as browsers and platforms change around it — which is what protects what you spent building it.",
    description: 'Ongoing updates and monitoring (first month included).',
    price: 30000,
    category: 'ongoing-care',
  },
  'growth-plan': {
    label: 'Growth Plan',
    benefit:
      "The site keeps improving every month rather than standing still while competitors move.",
    description: 'Maintenance plus a small batch of new features shipped every month (first month included).',
    price: 60000,
    category: 'ongoing-care',
  },
  hosting: {
    label: 'Managed Hosting',
    benefit:
      "It stays fast and online, and when something breaks it's our problem to fix rather than yours to diagnose.",
    description: 'We host and manage infrastructure (first month included).',
    price: 20000,
    category: 'ongoing-care',
  },
  'onboarding-retainer': {
    label: 'Onboarding & Support Retainer',
    benefit:
      "Your team is genuinely up to speed rather than nodding through a handover and quietly reverting to the old way.",
    description: 'A dedicated check-in cadence while your team gets up to speed (first month included).',
    price: 40000,
    category: 'ongoing-care',
  },
  'sla-uptime': {
    label: 'Uptime SLA',
    benefit:
      "You have a contractual guarantee and credits on the table if we don't hit it — not just a promise it'll probably be fine.",
    description: 'A contracted uptime guarantee with service credits, on top of Managed Hosting (first month included).',
    price: 50000,
    category: 'ongoing-care',
  },

  // Growth & conversion
  'video-content': {
    label: 'Video & Motion Content',
    benefit:
      "People retain video far better than a wall of text, and it's what actually gets watched and shared instead of skimmed and forgotten.",
    description: 'A produced product or brand video for your homepage or key landing pages.',
    price: 160000,
    category: 'growth-conversion',
  },
  'cro-testing': {
    label: 'Conversion Rate Optimization',
    benefit:
      "You stop guessing which headline or layout converts better and start knowing, so the site keeps getting more effective without a redesign.",
    description: 'A/B testing setup and a first round of tests on your highest-traffic pages.',
    price: 95000,
    category: 'growth-conversion',
  },
  'performance-optimization': {
    label: 'Performance & Speed Optimization',
    benefit:
      "Fewer people bail before the page even loads, and Google ranks faster sites higher — so this pays for itself twice.",
    description: 'A dedicated pass to cut load times — image/asset optimization, caching, and render-blocking cleanup — beyond what standard hosting provides.',
    price: 70000,
    category: 'growth-conversion',
  },
  'reporting-export': {
    label: 'Reporting & Data Export',
    benefit:
      "Your team gets the numbers in the format they actually need — a scheduled email, a CSV for their spreadsheet — instead of logging in and copying it out by hand.",
    description: 'Scheduled reports and CSV/PDF export built into your dashboard or analytics.',
    price: 65000,
    category: 'growth-conversion',
  },
};

/**
 * Some add-ons don't function on their own — e-commerce needs somewhere to
 * store orders, bookings need somewhere to store availability, etc. This maps
 * each such add-on to what it silently depends on, so the UI can auto-select
 * the dependency and explain why, instead of letting someone buy a feature
 * that can't actually be built without also buying its foundation.
 */
export const ADD_ON_REQUIRES: Partial<Record<AddOnKey, AddOnKey[]>> = {
  ecommerce: ['custom-backend'],
  booking: ['custom-backend'],
  subscriptions: ['custom-backend', 'user-accounts'],
  'push-notifications': ['custom-backend'],
  'admin-dashboard': ['custom-backend'],
  'sso-auth': ['user-accounts'],
  'public-api': ['custom-backend'],
  'white-label': ['custom-backend', 'user-accounts'],
  'sla-uptime': ['hosting'],
  'local-seo-multi': ['local-seo'],
  'multilingual-plus': ['multilingual'],
  'data-migration-large': ['data-migration'],
};

/**
 * A Web App's base price already assumes "their own account, their own data,
 * real functionality" — i.e. a backend and user accounts. Without this, a
 * client could check "Web App" ($8,000, which already implies a backend) AND
 * separately check "Custom Backend / API" (+$3,000), paying twice for the
 * same underlying thing. These add-ons are bundled into the base price for
 * the base services listed here — still shown as selected in the UI (since
 * the product genuinely has them), but priced at $0 and locked, since
 * unchecking them wouldn't actually remove a backend from a "Web App."
 * A plain Website has no backend by default, so Custom Backend / API stays a
 * real, separately-priced add-on there (e.g. a mostly-static site that just
 * needs a contact-form endpoint or a small bit of server logic).
 */
export const BASE_SERVICE_INCLUDES: Partial<Record<BaseService, AddOnKey[]>> = {
  'web-app': ['custom-backend', 'user-accounts'],
};

export function isIncludedInBase(baseService: BaseService, addOn: AddOnKey): boolean {
  return BASE_SERVICE_INCLUDES[baseService]?.includes(addOn) ?? false;
}

/** Add-ons bundled into this base service's price, merged into whatever's already selected. */
export function withBaseIncludes(baseService: BaseService, selected: AddOnKey[]): AddOnKey[] {
  const included = BASE_SERVICE_INCLUDES[baseService] ?? [];
  return Array.from(new Set([...selected, ...included]));
}

/**
 * Given the add-ons someone has checked, returns the full set including
 * anything those add-ons silently require (transitively). Pure and
 * order-independent — safe to call on every render.
 */
export function expandAddOnDependencies(selected: AddOnKey[]): AddOnKey[] {
  const result = new Set<AddOnKey>(selected);
  let grew = true;
  while (grew) {
    grew = false;
    for (const key of Array.from(result)) {
      const requires = ADD_ON_REQUIRES[key];
      if (!requires) continue;
      for (const req of requires) {
        if (!result.has(req)) {
          result.add(req);
          grew = true;
        }
      }
    }
  }
  return Array.from(result);
}

/**
 * Every add-on that depends (directly or transitively) on `key` — used so
 * unchecking a foundation like "Custom Backend" also clears whatever was
 * silently relying on it, rather than leaving the selection inconsistent.
 */
export function dependentsOf(key: AddOnKey, selected: AddOnKey[]): AddOnKey[] {
  const dependents: AddOnKey[] = [];
  for (const candidate of selected) {
    const closure = expandAddOnDependencies([candidate]);
    if (closure.includes(key) && candidate !== key) {
      dependents.push(candidate);
    }
  }
  return dependents;
}

export const CLIENT_TYPES: Record<
  ClientType,
  { label: string; description: string; multiplier: number }
> = {
  startup: {
    label: 'Startup',
    description: 'Early stage, moving fast.',
    multiplier: 0.9,
  },
  smb: {
    label: 'Small / Medium Business',
    description: 'Established business, standard scope.',
    multiplier: 1,
  },
  enterprise: {
    label: 'Enterprise',
    description: 'Larger org, added compliance and coordination needs.',
    multiplier: 1.25,
  },
};

export const TIMELINES: Record<
  TimelineKey,
  { label: string; description: string; weeks: string; multiplier: number }
> = {
  flexible: {
    label: 'Flexible',
    description: 'No firm deadline.',
    weeks: '12-16 weeks',
    multiplier: 0.95,
  },
  standard: {
    label: 'Standard',
    description: 'Typical turnaround.',
    weeks: '8-12 weeks',
    multiplier: 1,
  },
  rush: {
    label: 'Rush',
    description: 'Expedited delivery.',
    weeks: '4-6 weeks',
    multiplier: 1.2,
  },
};

export interface PricingSelection {
  baseService: BaseService;
  addOns: AddOnKey[];
  clientType: ClientType;
  timeline: TimelineKey;
}

export interface PricingBreakdown {
  basePrice: number;
  addOnsPrice: number;
  subtotal: number;
  clientTypeMultiplier: number;
  timelineMultiplier: number;
  totalPrice: number;
}

export function isBaseService(value: string): value is BaseService {
  return value in BASE_SERVICES;
}

export function isAddOnKey(value: string): value is AddOnKey {
  return value in ADD_ONS;
}

export function isClientType(value: string): value is ClientType {
  return value in CLIENT_TYPES;
}

export function isTimelineKey(value: string): value is TimelineKey {
  return value in TIMELINES;
}

export function calculatePrice(selection: PricingSelection): PricingBreakdown {
  const basePrice = BASE_SERVICES[selection.baseService].price;
  const addOnsPrice = selection.addOns.reduce(
    (sum, key) => sum + (isIncludedInBase(selection.baseService, key) ? 0 : ADD_ONS[key].price),
    0
  );
  const subtotal = basePrice + addOnsPrice;
  const clientTypeMultiplier = CLIENT_TYPES[selection.clientType].multiplier;
  const timelineMultiplier = TIMELINES[selection.timeline].multiplier;
  const totalPrice = Math.round(
    subtotal * clientTypeMultiplier * timelineMultiplier
  );

  return {
    basePrice,
    addOnsPrice,
    subtotal,
    clientTypeMultiplier,
    timelineMultiplier,
    totalPrice,
  };
}

/** Standard deposit percentage quoted in the contract template. */
export const DEPOSIT_PERCENT = 50;

/**
 * How far below the calculated price a manual override is allowed to go —
 * "may discount, may not gut the price." Applied wherever a totalPriceOverride
 * is accepted (manual project creation, sign-and-pay proposals), so a rushed
 * quote can't accidentally undercut the business by half.
 */
export const MAX_DISCOUNT_PERCENT = 15;

export function minAllowedPrice(calculatedTotal: number): number {
  return Math.round(calculatedTotal * (1 - MAX_DISCOUNT_PERCENT / 100));
}

export function depositAmount(totalPrice: number): number {
  return Math.round((totalPrice * DEPOSIT_PERCENT) / 100);
}

/** An ad-hoc line item Evan adds beyond the fixed catalogue — his own label and price. */
export interface CustomItem {
  label: string;
  priceCents: number;
}

/**
 * Validates and normalizes whatever shape came in over the wire (or out of
 * the Lead.proposalCustomItems JSON column) into a safe CustomItem[] — never
 * trusts client input for the price directly without checking it's a sane
 * positive integer, and drops anything malformed rather than throwing, since
 * a bad item shouldn't block sending the rest of the proposal.
 */
export function sanitizeCustomItems(input: unknown): CustomItem[] {
  if (!Array.isArray(input)) return [];
  const items: CustomItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const label = 'label' in raw && typeof raw.label === 'string' ? raw.label.trim().slice(0, 200) : '';
    const priceCents =
      'priceCents' in raw && typeof raw.priceCents === 'number' && Number.isFinite(raw.priceCents)
        ? Math.round(raw.priceCents)
        : NaN;
    if (!label || !Number.isFinite(priceCents) || priceCents <= 0) continue;
    items.push({ label, priceCents });
  }
  return items.slice(0, 20); // a runaway list on a proposal is a mistake, not a use case
}

export function customItemsTotal(items: CustomItem[]): number {
  return items.reduce((sum, i) => sum + i.priceCents, 0);
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/**
 * Everything the panel on a lead's page needs to say about one pain point,
 * written for someone who has never built software: what's actually wrong,
 * what it's costing the business (the bit that makes them care), and a line
 * that can be read out loud on a call more or less verbatim.
 *
 * `needs` are the things that genuinely fix the problem — no fix without
 * them. `upsell` are real, useful extras worth raising only once the core
 * is agreed. `implies` nudges which base build the whole job should be.
 */
export interface PainPointBrief {
  problem: string;
  costsThem: string;
  sayThis: string;
  needs: AddOnKey[];
  upsell: AddOnKey[];
  implies?: BaseService;
}

export const PAIN_POINT_BRIEFS: Record<PainPointKey, PainPointBrief> = {
  'no-website': {
    problem: "They have no website at all — anyone who hears about them has nothing to look at.",
    costsThem:
      "Every person who searches their name finds a competitor instead. They're paying for word of mouth and then losing it at the last step.",
    sayThis:
      "When someone hears about you and looks you up, what do they find? Right now that's a dead end — and that's the cheapest customer you'll ever get, lost for free.",
    needs: [],
    upsell: ['seo', 'copywriting', 'local-seo'],
    implies: 'website',
  },
  'outdated-design': {
    problem: "Their site looks old. Not broken — just visibly out of date, which people read as 'is this business still going?'",
    costsThem:
      "People decide whether they trust a business in a couple of seconds, and they decide on looks. A dated site quietly makes them look smaller and cheaper than they are.",
    sayThis:
      "Your site's doing its job, it just looks about ten years behind where your business actually is. People price you off that first screen before they read a word.",
    needs: [],
    upsell: ['brand-identity', 'copywriting', 'animations'],
    implies: 'website',
  },
  'not-mobile-friendly': {
    problem: "Their site doesn't work properly on a phone — text too small, buttons hard to hit, things overlapping.",
    costsThem:
      "Most people will visit them on a phone. If it's awkward on mobile, that's the majority of their traffic struggling.",
    sayThis:
      "Pull your own site up on your phone right now while we talk. That's what most of your customers are seeing — and Google ranks you on that version, not the desktop one.",
    needs: [],
    upsell: ['accessibility-audit'],
    implies: 'website',
  },
  'slow-site': {
    problem: 'Their site takes too long to load.',
    costsThem:
      "People leave before it finishes. It doesn't matter how good the site is if a chunk of visitors never see it.",
    sayThis:
      "Every extra second your site takes to load, a slice of people just back out. You're paying to get them there and losing them in the waiting room.",
    needs: [],
    upsell: ['hosting', 'maintenance'],
    implies: 'website',
  },
  'poor-seo': {
    problem: "They don't show up in Google when people search for what they do.",
    costsThem:
      "The people searching right now are the ones ready to buy. If they can't find them, that demand goes to whoever ranks above them.",
    sayThis:
      "Search what you do plus your city and tell me where you come up. Those people are already looking to buy — they just can't find you.",
    needs: ['seo'],
    upsell: ['local-seo', 'blog', 'copywriting', 'analytics'],
  },
  'no-analytics': {
    problem: "They have no tracking, so they can't see who visits, where from, or what people do on the site.",
    costsThem:
      "They're making decisions blind — no way to know which marketing works, so they either overspend or stop things that were working.",
    sayThis:
      "How do you know which of your marketing is actually bringing people in? Right now there's no way to tell — so you're guessing with real money.",
    needs: ['analytics'],
    upsell: ['local-seo'],
  },
  'no-app': {
    problem: "They have no mobile app — no presence on their customers' home screens.",
    costsThem:
      "Repeat customers have to go looking for them every time. An app makes them the default instead of a search away.",
    sayThis:
      "Your regulars have to go find you every single time. An icon on their phone means you're the one they tap without thinking.",
    needs: [],
    upsell: ['push-notifications', 'app-store-submission', 'user-accounts'],
    implies: 'ios-app',
  },
  'manual-processes': {
    problem: 'Their team is doing things by hand — copying between spreadsheets, re-typing orders, chasing things over email.',
    costsThem:
      "Paid hours going into work software should do, plus the mistakes that come with re-typing. It gets worse as they grow, not better.",
    sayThis:
      "Walk me through what happens after someone places an order. Every step you just described that a person does by hand is an hour you're paying for, every week, forever.",
    needs: ['custom-backend', 'integrations'],
    upsell: ['admin-dashboard', 'crm-setup'],
    implies: 'web-app',
  },
  'no-booking': {
    problem: "Customers can't book online — it's phone calls, DMs, or back-and-forth emails.",
    costsThem:
      "Anyone who wants to book outside working hours gives up or books elsewhere. Someone on their team is also stuck being a receptionist.",
    sayThis:
      "What happens when someone wants to book you at 9pm? Right now they can't — and most of them won't ring back tomorrow.",
    needs: ['booking'],
    upsell: ['crm-setup', 'email-marketing', 'user-accounts'],
  },
  'no-ecommerce': {
    problem: "They can't take payment online — no way for a customer to actually buy without a human involved.",
    costsThem:
      "Every sale needs a person to close it. They can only sell as fast as someone can answer the phone.",
    sayThis:
      "Right now every sale needs one of your people involved. That caps how much you can sell in a day at however many calls you can answer.",
    needs: ['ecommerce'],
    upsell: ['subscriptions', 'email-marketing', 'copywriting'],
  },
  'weak-branding': {
    problem: 'Their look is inconsistent — logo, colours and wording differ across their site, socials and print.',
    costsThem:
      "They read as scrappy next to competitors who look sharp, which makes it harder to charge what they're worth.",
    sayThis:
      "Your website, your Instagram and your signage all look like three different companies. That inconsistency is why you get haggled on price.",
    needs: ['brand-identity'],
    upsell: ['copywriting', 'illustrations'],
  },
  'security-concerns': {
    problem: 'There are security or compliance gaps — outdated software, no proper privacy handling, or data kept somewhere it should not be.',
    costsThem:
      "One incident and it's legal exposure plus the reputational hit. It's the cheapest problem to fix before it happens and the most expensive after.",
    sayThis:
      "If customer data leaked tomorrow, who'd be liable? This is the one thing on the list that can end a business rather than just slow it down.",
    needs: ['privacy-compliance'],
    upsell: ['accessibility-audit', 'maintenance', 'hosting'],
  },
  'scaling-issues': {
    problem: "What they've got works at today's size but falls over as they grow — slow, fragile, held together manually.",
    costsThem:
      "Growth actively hurts. More customers means more breakage, so success creates the fire.",
    sayThis:
      "What you've got works today. Double your customers and it doesn't — so the busier you get, the more time you spend firefighting instead of selling.",
    needs: ['custom-backend'],
    upsell: ['admin-dashboard', 'hosting', 'maintenance'],
    implies: 'web-app',
  },
  'disconnected-tools': {
    problem: "Their tools don't talk to each other — the same information gets entered into several systems by hand.",
    costsThem:
      "Duplicate data entry, and numbers that disagree between systems so nobody trusts any of them.",
    sayThis:
      "How many places does one customer's details get typed into? Every one of those is a chance for them to disagree — and then you don't know which one's right.",
    needs: ['integrations'],
    upsell: ['crm-setup', 'admin-dashboard', 'data-migration'],
  },
};

/**
 * Back-compat shape for anything still reading the old needs/upsell table.
 * Derived from the briefs so there's only one place to edit.
 */
export const PAIN_POINT_RECOMMENDATIONS: Record<PainPointKey, { needs: AddOnKey[]; upsell: AddOnKey[] }> =
  Object.fromEntries(
    (Object.entries(PAIN_POINT_BRIEFS) as [PainPointKey, PainPointBrief][]).map(([k, v]) => [
      k,
      { needs: v.needs, upsell: v.upsell },
    ])
  ) as Record<PainPointKey, { needs: AddOnKey[]; upsell: AddOnKey[] }>;

/**
 * Phrases that reliably indicate a pain point when they turn up in freeform
 * research notes. Deliberately conservative — a false positive puts a wrong
 * recommendation in front of a rep on a live call, which is worse than a
 * miss. Anything inferred this way is labelled as coming from the notes so
 * it can be sanity-checked rather than trusted blindly.
 */
const NOTE_SIGNALS: Array<{ key: PainPointKey; patterns: RegExp[] }> = [
  { key: 'no-booking', patterns: [/\bbook(ing|ings)?\b/i, /\bappointment/i, /\bschedul/i, /\breservation/i] },
  { key: 'no-ecommerce', patterns: [/\be-?commerce\b/i, /\bonline store\b/i, /\bshop online\b/i, /\bcheckout\b/i, /\bshopify\b/i] },
  { key: 'poor-seo', patterns: [/\bseo\b/i, /\branking?s?\b/i, /\bsearch results?\b/i, /\bgoogle search\b/i] },
  { key: 'no-analytics', patterns: [/\banalytics\b/i, /\btracking\b/i, /\bgoogle analytics\b/i] },
  { key: 'not-mobile-friendly', patterns: [/\bmobile[- ]friendly\b/i, /\bnot responsive\b/i, /\bon (a )?phone\b/i] },
  { key: 'slow-site', patterns: [/\bslow\b/i, /\bload(ing)? time/i, /\bpage ?speed\b/i] },
  { key: 'outdated-design', patterns: [/\boutdated\b/i, /\bdated\b/i, /\bold(-| )?looking\b/i, /\bwordpress theme\b/i, /\b(19|20)\d0s\b/i] },
  { key: 'weak-branding', patterns: [/\bbranding\b/i, /\blogo\b/i, /\binconsistent\b/i] },
  { key: 'manual-processes', patterns: [/\bmanual(ly)?\b/i, /\bspreadsheet/i, /\bby hand\b/i, /\bpaper(work)?\b/i] },
  { key: 'disconnected-tools', patterns: [/\bintegrat/i, /\bdoesn'?t sync\b/i, /\bdon'?t talk\b/i, /\bcopy(ing)? (data|details)\b/i] },
  { key: 'no-app', patterns: [/\bmobile app\b/i, /\bios app\b/i, /\bapp store\b/i] },
  { key: 'security-concerns', patterns: [/\bsecurity\b/i, /\bgdpr\b/i, /\bhipaa\b/i, /\bcompliance\b/i, /\bnot secure\b/i, /\bhttp:\/\//i] },
  { key: 'scaling-issues', patterns: [/\bscal(e|ing)\b/i, /\bcan'?t keep up\b/i, /\boutgrow/i] },
];

/**
 * Sections of the notes that describe OUR sales plan rather than THEIR
 * business. Research exports routinely include a line like "...CRM, SEO,
 * analytics, booking, e-commerce, portal, integration and compliance
 * pricing" — our own service catalogue. Scanning that for pain signals
 * concluded every lead had an e-commerce and a compliance problem, so these
 * sections are cut before any matching happens.
 */
const INTERNAL_NOTE_LABELS = /(NEEDS|UPSELL|PRICING|ESTIMATE|ANGLE|GUIDANCE|SEGMENT|SOURCE|TEMPLATE|SCRIPT)/i;

function stripInternalNoteSections(text: string): string {
  return text
    .split(/\s+\|\s+|\n{2,}/)
    .filter((section) => {
      const label = section.split(':')[0];
      return !(label.length <= 40 && INTERNAL_NOTE_LABELS.test(label));
    })
    .join('\n');
}

/** Pain points implied by freeform notes but not explicitly ticked on the lead. */
export function inferPainPointsFromNotes(
  rawText: string | null | undefined,
  already: PainPointKey[]
): PainPointKey[] {
  if (!rawText) return [];
  const text = stripInternalNoteSections(rawText);
  if (!text.trim()) return [];
  const have = new Set(already);
  return NOTE_SIGNALS.filter(({ key, patterns }) => !have.has(key) && patterns.some((re) => re.test(text))).map(
    ({ key }) => key
  );
}

/**
 * Works out which of our canonical pain points a hand-written one is really
 * describing, so a bespoke line like "Manual RFQ qualification" can borrow
 * the matching brief's "why they should care" and its call script.
 *
 * Deliberately strict: a wrong match hands the rep a script about the wrong
 * problem, which is worse on a live call than having no script at all. Every
 * pattern here has to be specific enough that a false positive is unlikely,
 * and anything ambiguous returns null and simply gets no script.
 */
const WRITTEN_POINT_SIGNALS: Array<{ key: PainPointKey; patterns: RegExp[] }> = [
  { key: 'not-mobile-friendly', patterns: [/\bmobile\b/i, /\bon (a )?phone\b/i, /\bresponsive\b/i] },
  { key: 'poor-seo', patterns: [/\bsearch(es|able)?\b/i, /\bseo\b/i, /\branking?s?\b/i, /\bdiscoverab/i] },
  {
    key: 'no-analytics',
    patterns: [/\banalytics\b/i, /\btracking\b/i, /\bmeasur/i, /\bvisibility into\b/i, /\bintelligence\b/i],
  },
  {
    key: 'manual-processes',
    patterns: [/\bmanual(ly)?\b/i, /\bby hand\b/i, /\brfq\b/i, /\bspreadsheet/i, /\bre-?type/i, /\bthrough email\b/i],
  },
  {
    key: 'disconnected-tools',
    patterns: [/\bdisconnect/i, /\bnot unified\b/i, /\bfragment/i, /\bsilo/i, /\bdon'?t talk\b/i],
  },
  { key: 'no-booking', patterns: [/\bbook(ing|ings)?\b/i, /\bappointment/i, /\bschedul/i] },
  { key: 'no-ecommerce', patterns: [/\breorder\b/i, /\bcheckout\b/i, /\bbuy online\b/i, /\bpurchase online\b/i] },
  { key: 'weak-branding', patterns: [/\bbrand(ing)?\b/i, /\blogo\b/i, /\binconsistent\b/i] },
  {
    key: 'outdated-design',
    patterns: [/\bfirst impression\b/i, /\boutdated\b/i, /\bdated\b/i, /\btemplate\b/i, /\bcredibilit/i],
  },
  { key: 'security-concerns', patterns: [/\bsecurity\b/i, /\bcomplian/i, /\bgdpr\b/i, /\bprivacy\b/i] },
  { key: 'scaling-issues', patterns: [/\bscal(e|ing)\b/i, /\bcan'?t keep up\b/i, /\boutgrow/i] },
  { key: 'no-app', patterns: [/\bmobile app\b/i, /\bapp store\b/i] },
];

function singleSignalMatch(text: string): PainPointKey | null {
  const hits = WRITTEN_POINT_SIGNALS.filter(({ patterns }) => patterns.some((re) => re.test(text)));
  // More than one strong signal means the text spans several problems and we
  // can't say which script fits — better to show none than to guess wrong.
  return hits.length === 1 ? hits[0].key : null;
}

export function classifyWrittenPoint(point: string, explanation?: string | null): PainPointKey | null {
  // The headline names one problem; the explanation underneath usually
  // touches several while describing it ("mobile conversion friction" whose
  // body also mentions booking and estimates). So the headline decides when
  // it can, and the body is only consulted when the headline says nothing.
  return singleSignalMatch(point) ?? singleSignalMatch(`${point} ${explanation ?? ''}`);
}

/** One line item in the recommendation, carrying why it's being recommended. */
export interface RecommendedItem {
  key: AddOnKey;
  label: string;
  description: string;
  price: number;
  /** Labels of the pain points that triggered this — shown as "why". */
  becauseOf: string[];
}

export interface SalesRecommendations {
  /** The core build the whole job is priced around. */
  baseService: BaseService;
  baseReason: string;
  /** Must-haves: without these the problems Evan just named aren't fixed. */
  needs: RecommendedItem[];
  /** Real extras, worth raising only after the core is agreed. */
  upsell: RecommendedItem[];
  /** Base + needs, before any client-type or timeline adjustment. */
  coreTotal: number;
  /** Core plus every upsell taken. */
  maxTotal: number;
  /** Back-compat for older call sites. */
  needKeys: AddOnKey[];
  upsellKeys: AddOnKey[];
}

/**
 * Turns this lead's specific pain points into a priced, explained sell:
 * which base build fits, what must be included to actually solve what was
 * found, what can be added later, and what each of those totals to.
 */
export function buildSalesRecommendations(painPointKeys: PainPointKey[]): SalesRecommendations {
  const briefs = painPointKeys.map((k) => [k, PAIN_POINT_BRIEFS[k]] as const).filter(([, b]) => !!b);

  // Pick the base build off the most demanding thing they need. A native app
  // plus anything system-shaped is genuinely a multi-platform job; systems
  // work alone is a web app; everything else is a website.
  const implied = new Set(briefs.map(([, b]) => b.implies).filter(Boolean) as BaseService[]);
  let baseService: BaseService = 'website';
  let baseReason = 'Nothing here needs accounts or logins — a website covers it.';
  if (implied.has('ios-app') && (implied.has('web-app') || implied.has('website'))) {
    baseService = 'multi';
    baseReason = 'They need both a phone app and a proper system behind it — that\'s one job, built together.';
  } else if (implied.has('ios-app')) {
    baseService = 'ios-app';
    baseReason = 'What they\'re missing lives on a phone home screen, so this is a native app build.';
  } else if (implied.has('web-app')) {
    baseService = 'web-app';
    baseReason = 'Their problems are about how the business runs, not how it looks — that means a tool people log into, not a brochure site.';
  } else if (implied.has('website')) {
    baseService = 'website';
    baseReason = 'Everything they\'re missing is about how they show up publicly — a website is the right build.';
  }

  // Collect add-ons with the pain point labels that justified them, so the
  // panel can show "why" instead of an unexplained shopping list.
  const needMap = new Map<AddOnKey, Set<string>>();
  const upsellMap = new Map<AddOnKey, Set<string>>();
  for (const [key, brief] of briefs) {
    const label = PAIN_POINTS[key];
    for (const a of brief.needs) {
      if (!needMap.has(a)) needMap.set(a, new Set());
      needMap.get(a)!.add(label);
    }
    for (const a of brief.upsell) {
      if (!upsellMap.has(a)) upsellMap.set(a, new Set());
      upsellMap.get(a)!.add(label);
    }
  }
  // A core need is never also an upsell, and anything the base build already
  // covers is not a separate line — quoting it twice loses trust fast.
  for (const a of needMap.keys()) upsellMap.delete(a);
  for (const a of [...needMap.keys()]) if (isIncludedInBase(baseService, a)) needMap.delete(a);
  for (const a of [...upsellMap.keys()]) if (isIncludedInBase(baseService, a)) upsellMap.delete(a);

  const toItems = (m: Map<AddOnKey, Set<string>>): RecommendedItem[] =>
    Array.from(m.entries())
      .map(([key, why]) => ({
        key,
        label: ADD_ONS[key].label,
        description: ADD_ONS[key].description,
        price: ADD_ONS[key].price,
        becauseOf: Array.from(why),
      }))
      .sort((a, b) => b.price - a.price);

  const needs = toItems(needMap);
  const upsell = toItems(upsellMap);
  const coreTotal = BASE_SERVICES[baseService].price + needs.reduce((s, i) => s + i.price, 0);

  return {
    baseService,
    baseReason,
    needs,
    upsell,
    coreTotal,
    maxTotal: coreTotal + upsell.reduce((s, i) => s + i.price, 0),
    needKeys: needs.map((i) => i.key),
    upsellKeys: upsell.map((i) => i.key),
  };
}
