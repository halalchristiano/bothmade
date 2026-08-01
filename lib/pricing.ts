// Pricing model for the /start calculator, Stripe checkout, and Project records.
// All prices are in cents (USD), matching Project.basePrice / Project.totalPrice.

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
  | 'admin-dashboard'
  | 'user-accounts'
  | 'push-notifications'
  | 'live-chat'
  // Accessibility & compliance
  | 'accessibility-audit'
  | 'privacy-compliance'
  // Ongoing care (recurring — first month included in price)
  | 'maintenance'
  | 'growth-plan'
  | 'hosting'
  | 'onboarding-retainer';

export type AddOnCategory =
  | 'content-growth'
  | 'commerce-bookings'
  | 'design-motion'
  | 'backend-integrations'
  | 'accessibility-compliance'
  | 'ongoing-care';

export type ClientType = 'startup' | 'smb' | 'enterprise';

export type TimelineKey = 'flexible' | 'standard' | 'rush';

export const BASE_SERVICES: Record<
  BaseService,
  { label: string; description: string; price: number }
> = {
  website: {
    label: 'Website',
    description: 'Marketing site or storefront, custom-designed and built.',
    price: 300000,
  },
  'web-app': {
    label: 'Web App',
    description: 'A full web application with accounts, data, and logic.',
    price: 800000,
  },
  'ios-app': {
    label: 'iOS App',
    description: 'A native iPhone and iPad app.',
    price: 1000000,
  },
  'macos-app': {
    label: 'macOS App',
    description: 'A native Mac app.',
    price: 1000000,
  },
  visionos: {
    label: 'Vision Pro App',
    description: 'A native visionOS spatial computing app.',
    price: 1500000,
  },
  multi: {
    label: 'Multi-Platform',
    description: 'Two or more of the above, built together as one system.',
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
};

export const ADD_ONS: Record<
  AddOnKey,
  { label: string; description: string; price: number; category: AddOnCategory }
> = {
  // Content & growth
  seo: {
    label: 'SEO Setup',
    description: 'Technical SEO, metadata, and search console setup.',
    price: 75000,
    category: 'content-growth',
  },
  analytics: {
    label: 'Analytics',
    description: 'Event tracking and a reporting dashboard.',
    price: 50000,
    category: 'content-growth',
  },
  copywriting: {
    label: 'Professional Copywriting',
    description: 'Website and product copy written for you, not just placeholder text.',
    price: 90000,
    category: 'content-growth',
  },
  cms: {
    label: 'Content Management System',
    description: 'Edit pages, images, and copy yourself without touching code.',
    price: 120000,
    category: 'content-growth',
  },
  blog: {
    label: 'Blog / Articles',
    description: 'A blog section with categories, tags, and RSS.',
    price: 60000,
    category: 'content-growth',
  },
  multilingual: {
    label: 'Multi-language Support',
    description: 'Translated content and language switching for a second language.',
    price: 80000,
    category: 'content-growth',
  },

  // Commerce & bookings
  ecommerce: {
    label: 'E-commerce & Payments',
    description: 'Product catalog, cart, and checkout — Stripe or your platform of choice.',
    price: 250000,
    category: 'commerce-bookings',
  },
  booking: {
    label: 'Appointments & Booking',
    description: 'Calendar scheduling so customers can book time with you directly.',
    price: 150000,
    category: 'commerce-bookings',
  },
  subscriptions: {
    label: 'Subscriptions & Memberships',
    description: 'Recurring billing, member accounts, and gated content.',
    price: 220000,
    category: 'commerce-bookings',
  },

  // Design & motion
  illustrations: {
    label: 'Custom Illustrations & Icons',
    description: 'Original artwork and iconography instead of stock assets.',
    price: 70000,
    category: 'design-motion',
  },
  animations: {
    label: 'High-End Animations',
    description: 'Scroll-driven motion, micro-interactions, the details that make it feel alive.',
    price: 140000,
    category: 'design-motion',
  },
  threed: {
    label: '3D / WebGL Visuals',
    description: 'Interactive 3D scenes or product visualizations.',
    price: 200000,
    category: 'design-motion',
  },
  'brand-identity': {
    label: 'Brand Identity',
    description: 'Logo, color system, and typography — a full visual identity, not just a website.',
    price: 180000,
    category: 'design-motion',
  },

  // Backend & integrations
  'custom-backend': {
    label: 'Custom Backend / API',
    description: 'A purpose-built backend for logic that off-the-shelf tools can\'t handle.',
    price: 300000,
    category: 'backend-integrations',
  },
  integrations: {
    label: 'Third-Party Integrations',
    description: 'Connect to your CRM, Slack, Zapier, or other tools you already run on.',
    price: 100000,
    category: 'backend-integrations',
  },
  'admin-dashboard': {
    label: 'Admin Dashboard',
    description: 'An internal tool for your team to manage data without touching the database.',
    price: 220000,
    category: 'backend-integrations',
  },
  'user-accounts': {
    label: 'User Accounts & Auth',
    description: 'Sign-up, login, and per-user data — the foundation for any logged-in product.',
    price: 150000,
    category: 'backend-integrations',
  },
  'push-notifications': {
    label: 'Push Notifications',
    description: 'Re-engage users with native push, web push, or both.',
    price: 90000,
    category: 'backend-integrations',
  },
  'live-chat': {
    label: 'Live Chat Widget',
    description: 'Real-time chat support built into your product.',
    price: 70000,
    category: 'backend-integrations',
  },

  // Accessibility & compliance
  'accessibility-audit': {
    label: 'Accessibility Audit (WCAG)',
    description: 'A full accessibility pass so your product works for everyone.',
    price: 60000,
    category: 'accessibility-compliance',
  },
  'privacy-compliance': {
    label: 'Privacy & Compliance Setup',
    description: 'Cookie consent, privacy policy wiring, and GDPR/CCPA-friendly data handling.',
    price: 50000,
    category: 'accessibility-compliance',
  },

  // Ongoing care (recurring)
  maintenance: {
    label: 'Maintenance Plan',
    description: 'Ongoing updates and monitoring (first month included).',
    price: 30000,
    category: 'ongoing-care',
  },
  'growth-plan': {
    label: 'Growth Plan',
    description: 'Maintenance plus a small batch of new features shipped every month (first month included).',
    price: 60000,
    category: 'ongoing-care',
  },
  hosting: {
    label: 'Managed Hosting',
    description: 'We host and manage infrastructure (first month included).',
    price: 20000,
    category: 'ongoing-care',
  },
  'onboarding-retainer': {
    label: 'Onboarding & Support Retainer',
    description: 'A dedicated check-in cadence while your team gets up to speed (first month included).',
    price: 40000,
    category: 'ongoing-care',
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
};

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
    (sum, key) => sum + ADD_ONS[key].price,
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

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
