// Pricing model for the /start calculator, Stripe checkout, and Project records.
// All prices are in cents (USD), matching Project.basePrice / Project.totalPrice.

export type BaseService =
  | 'website'
  | 'web-app'
  | 'ios-app'
  | 'macos-app'
  | 'visionos'
  | 'multi';

export type AddOnKey = 'seo' | 'analytics' | 'maintenance' | 'hosting';

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

export const ADD_ONS: Record<AddOnKey, { label: string; description: string; price: number }> = {
  seo: {
    label: 'SEO Setup',
    description: 'Technical SEO, metadata, and search console setup.',
    price: 75000,
  },
  analytics: {
    label: 'Analytics',
    description: 'Event tracking and a reporting dashboard.',
    price: 50000,
  },
  maintenance: {
    label: 'Maintenance Plan',
    description: 'Ongoing updates and monitoring (first month included).',
    price: 30000,
  },
  hosting: {
    label: 'Managed Hosting',
    description: 'We host and manage infrastructure (first month included).',
    price: 20000,
  },
};

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
