/**
 * Pricing for the per-lead sales brief.
 *
 * Every point in a research dossier needs a number beside it before anyone
 * can quote from it. Most points match an item in the sales playbook and
 * take that item's price. The rest — the ones a researcher invented for
 * this particular business — have no price anywhere, and used to reach the
 * rep as a blank.
 *
 * A blank is the worst possible answer mid-call, so those get a *suggested*
 * price instead, sized to the business rather than pulled from thin air,
 * and flagged as custom so it's obvious the number still needs signing off
 * before it goes on a PDF.
 */

import { findPlaybookEntry, type PlaybookEntry } from '@/lib/playbook-seed';
import { parsePointPriceCents, type SalesPoint } from '@/lib/leads';

export type CompanySizeBand = 'solo' | 'small' | 'medium' | 'large' | 'enterprise';

export const COMPANY_SIZE_BANDS: CompanySizeBand[] = ['solo', 'small', 'medium', 'large', 'enterprise'];

export const COMPANY_SIZE_LABELS: Record<CompanySizeBand, string> = {
  solo: 'Solo / owner-operator',
  small: 'Small (2–10 staff)',
  medium: 'Medium (11–50 staff)',
  large: 'Large (51–250 staff)',
  enterprise: 'Enterprise (250+ staff)',
};

export function isCompanySizeBand(value: string): value is CompanySizeBand {
  return (COMPANY_SIZE_BANDS as readonly string[]).includes(value);
}

/**
 * What a business of each size will bear for one line item, relative to the
 * playbook's list prices — which are written for the small end, since that's
 * what most dossiers cover. A ten-site operator isn't buying the same
 * booking system as a one-van plumber even when the point reads identically.
 */
const SIZE_MULTIPLIER: Record<CompanySizeBand, number> = {
  solo: 0.7,
  small: 1,
  medium: 1.6,
  large: 2.4,
  enterprise: 3.2,
};

/**
 * Starting points for an item nobody has priced, chosen against the spread
 * of the playbook's own seeded prices: essentials sit around the middle of
 * the must-have range, upsells slightly above, since an upsell is by
 * definition the discretionary purchase and is priced to be worth raising.
 */
const BASE_SUGGESTION_CENTS: Record<'essential' | 'upsell' | 'pain', number> = {
  essential: 60000,
  upsell: 90000,
  // A pain point describes a problem rather than a deliverable, so it isn't
  // a chargeable line at all — the fix for it is what appears in essentials.
  pain: 0,
};

export interface CompanySizeSignals {
  companySize?: string | null;
  employeeCount?: number | null;
  locationCount?: number | null;
  annualRevenueCents?: number | null;
  estimatedValue?: number | null;
  estimateHighCents?: number | null;
}

/** Why we landed on a band — shown to whoever has to approve the number. */
export interface SizedCompany {
  band: CompanySizeBand;
  basis: string;
  /**
   * False when nothing in the import said anything about size and the band
   * is purely a fallback. Worth pricing against, not worth writing down as
   * though it were a fact about the business.
   */
  known: boolean;
}

/**
 * Works out how big this business is from whatever the CSV happened to
 * carry, in descending order of how directly each signal answers the
 * question. An explicit band beats a headcount, a headcount beats revenue,
 * and the deal size is the last resort — it's our own guess, not a fact
 * about them, so it only decides things when nothing real is on file.
 */
export function sizeCompany(signals: CompanySizeSignals): SizedCompany {
  const explicit = signals.companySize?.trim().toLowerCase();
  if (explicit && isCompanySizeBand(explicit)) {
    return { band: explicit, basis: 'stated in the import', known: true };
  }

  const staff = signals.employeeCount;
  if (staff && staff > 0) {
    const band: CompanySizeBand =
      staff <= 1 ? 'solo' : staff <= 10 ? 'small' : staff <= 50 ? 'medium' : staff <= 250 ? 'large' : 'enterprise';
    return { band, basis: `${staff} staff`, known: true };
  }

  const sites = signals.locationCount;
  if (sites && sites > 1) {
    const band: CompanySizeBand = sites <= 3 ? 'medium' : sites <= 10 ? 'large' : 'enterprise';
    return { band, basis: `${sites} locations`, known: true };
  }

  const revenue = signals.annualRevenueCents;
  if (revenue && revenue > 0) {
    const millions = revenue / 100_000_000;
    const band: CompanySizeBand =
      millions < 0.25 ? 'solo' : millions < 2 ? 'small' : millions < 10 ? 'medium' : millions < 50 ? 'large' : 'enterprise';
    return {
      band,
      basis: `~$${Math.round(revenue / 100).toLocaleString('en-US')} annual revenue`,
      known: true,
    };
  }

  // The deal size is our own estimate of them, not a fact about them, so it
  // prices a line item but never gets written back as their recorded size.
  const deal = signals.estimateHighCents ?? signals.estimatedValue;
  if (deal && deal > 0) {
    const dollars = deal / 100;
    const band: CompanySizeBand =
      dollars < 5000 ? 'solo' : dollars < 15000 ? 'small' : dollars < 40000 ? 'medium' : 'large';
    return { band, basis: `$${Math.round(dollars).toLocaleString('en-US')} deal size`, known: false };
  }

  return { band: 'small', basis: 'nothing on file — assumed small', known: false };
}

/** Rounds a suggestion to something a rep can say out loud without hedging. */
const roundToFifty = (cents: number) => Math.max(5000, Math.round(cents / 5000) * 5000);

export interface SuggestedPrice {
  priceCents: number;
  /** One line explaining where the number came from, shown beside it. */
  reason: string;
}

/**
 * A defensible price for a point that isn't in the playbook. Deliberately a
 * round number derived from a stated rule rather than a precise-looking
 * figure, so nobody mistakes it for a price that has actually been agreed.
 */
export function suggestCustomPrice(
  kind: 'essential' | 'upsell' | 'pain',
  size: SizedCompany
): SuggestedPrice {
  const base = BASE_SUGGESTION_CENTS[kind];
  if (base === 0) return { priceCents: 0, reason: 'a problem to raise, not a line to charge for' };

  const multiplier = SIZE_MULTIPLIER[size.band];
  const priceCents = roundToFifty(base * multiplier);
  return {
    priceCents,
    reason: `${kind} baseline of $${base / 100} × ${multiplier} for a ${size.band} business (${size.basis})`,
  };
}

export interface ResolvedPoint extends SalesPoint {
  /** The playbook item this matched, if any. Null means it's a custom line. */
  entry: PlaybookEntry | null;
  /** Set only on custom lines — why the suggested figure is what it is. */
  suggestionReason: string | null;
}

/**
 * Attaches a price to every point in a group, once, at import time.
 *
 * Order of precedence: a price written into the CSV wins outright (whoever
 * built the sheet had a reason), then the playbook's list price, then a
 * size-scaled suggestion. Only the last of those is marked custom, because
 * only the last one is a number nobody has agreed to yet.
 */
export function resolvePointPrices(
  points: SalesPoint[],
  kind: 'essential' | 'upsell' | 'pain',
  playbook: Map<string, PlaybookEntry>,
  size: SizedCompany
): ResolvedPoint[] {
  return points.map((p) => {
    const entry = findPlaybookEntry(p.point, playbook);

    if (p.priceCents !== null) {
      // Given explicitly in the sheet. It's still custom if we can't tie it
      // to a catalogue item — the price is settled, the item isn't.
      return { ...p, entry, isCustom: p.isCustom || !entry, suggestionReason: null };
    }

    if (entry) {
      return { ...p, entry, priceCents: entry.priceCents, isCustom: false, suggestionReason: null };
    }

    const suggestion = suggestCustomPrice(kind, size);
    return {
      ...p,
      entry: null,
      priceCents: suggestion.priceCents,
      isCustom: true,
      suggestionReason: suggestion.reason,
    };
  });
}

/** Total of a priced group, ignoring umbrella lines priced at zero. */
export function pointsTotalCents(points: Array<{ priceCents: number | null }>): number {
  return points.reduce((sum, p) => sum + (p.priceCents ?? 0), 0);
}

/**
 * Reads a "$8,000" / "8000" cell. Re-exported here so the importer has one
 * place to reach for money parsing across both points and estimates.
 */
export const parsePriceCents = parsePointPriceCents;
