import { prisma } from '@/lib/prisma';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type TimelineKey,
} from '@/lib/pricing';

/**
 * Prices the team can change without a deploy.
 *
 * The catalogue in lib/pricing.ts stays the source of truth for what each
 * item *is* — label, description, benefit copy, category, dependencies —
 * because that is product copy and belongs in review. What something costs
 * is a business decision, and needing an engineer and a deploy to change a
 * price is how a stale price ends up on a signed contract.
 *
 * An absent row means "use the catalogue price", so the table starts empty
 * and only grows as prices are actually changed. That also means deleting
 * a row is a clean revert to the shipped price.
 *
 * Multipliers are stored ×1000 as integers (1250 = ×1.25). No price in this
 * codebase should be within reach of a float.
 */

export const MULTIPLIER_SCALE = 1000;

export type OverrideKey =
  | `base:${BaseService}`
  | `addon:${AddOnKey}`
  | `clientType:${ClientType}`
  | `timeline:${TimelineKey}`;

export interface ResolvedPricing {
  baseServices: Record<string, number>;
  addOns: Record<string, number>;
  clientTypeMultipliers: Record<string, number>;
  timelineMultipliers: Record<string, number>;
}

/** The shipped catalogue, with no overrides applied. */
export function catalogueDefaults(): ResolvedPricing {
  return {
    baseServices: Object.fromEntries(
      Object.entries(BASE_SERVICES).map(([k, v]) => [k, v.price])
    ),
    addOns: Object.fromEntries(Object.entries(ADD_ONS).map(([k, v]) => [k, v.price])),
    clientTypeMultipliers: Object.fromEntries(
      Object.entries(CLIENT_TYPES).map(([k, v]) => [k, v.multiplier])
    ),
    timelineMultipliers: Object.fromEntries(
      Object.entries(TIMELINES).map(([k, v]) => [k, v.multiplier])
    ),
  };
}

function isValidKey(key: string): key is OverrideKey {
  const [kind, id] = key.split(':');
  if (!kind || !id) return false;
  if (kind === 'base') return id in BASE_SERVICES;
  if (kind === 'addon') return id in ADD_ONS;
  if (kind === 'clientType') return id in CLIENT_TYPES;
  if (kind === 'timeline') return id in TIMELINES;
  return false;
}

export { isValidKey as isValidPricingKey };

/**
 * The catalogue with any overrides applied.
 *
 * Deliberately fails soft: if the table is unreachable (a deploy landing
 * ahead of its migration, a database blip) the shipped prices are used and
 * the error is logged. A pricing page that shows the previous prices is
 * recoverable; one that 500s during a checkout is not.
 */
export async function resolvedPricing(): Promise<ResolvedPricing> {
  const resolved = catalogueDefaults();

  try {
    const overrides = await prisma.pricingOverride.findMany();
    for (const { key, value } of overrides) {
      if (!isValidKey(key)) continue; // a key for an item since removed from the catalogue
      const [kind, id] = key.split(':');
      if (kind === 'base') resolved.baseServices[id] = value;
      else if (kind === 'addon') resolved.addOns[id] = value;
      else if (kind === 'clientType') resolved.clientTypeMultipliers[id] = value / MULTIPLIER_SCALE;
      else if (kind === 'timeline') resolved.timelineMultipliers[id] = value / MULTIPLIER_SCALE;
    }
  } catch (error) {
    console.error('Pricing overrides unavailable, using catalogue prices:', error);
  }

  return resolved;
}

/**
 * Bounds on what an override may be set to.
 *
 * Not a permission check — that's the caller's job — but a guard against
 * the fat-finger case, where a missing "00" or an extra one turns a £3,000
 * website into £30 or £300,000 and the first anyone knows is a signed
 * contract. Prices are entered in whole currency units by humans.
 */
export function validateOverride(
  key: string,
  value: number
): { ok: true } | { ok: false; error: string } {
  if (!isValidKey(key)) return { ok: false, error: `Unknown pricing key: ${key}` };
  if (!Number.isInteger(value) || value < 0) {
    return { ok: false, error: 'Price must be a whole, non-negative number.' };
  }

  const [kind] = key.split(':');

  if (kind === 'clientType' || kind === 'timeline') {
    // ×0.5 to ×5.0. A multiplier outside that is a typo, not a policy.
    if (value < 500 || value > 5000) {
      return {
        ok: false,
        error: 'Multiplier must be between ×0.5 and ×5.0.',
      };
    }
    return { ok: true };
  }

  // £0 is legitimate (a bundled add-on); £1,000,000 is a typo.
  if (value > 100_000_000) {
    return { ok: false, error: 'That price looks like a typo — cap is $1,000,000.' };
  }
  return { ok: true };
}
