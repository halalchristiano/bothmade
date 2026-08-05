/**
 * The client brochure: a priced, printable proposal built out of the same
 * catalogue the checkout charges from.
 *
 * The point of putting this in code rather than writing each one by hand is
 * that a brochure is a document with prices in it. A price typed into a
 * design file is a price that disagrees with the contract the moment anyone
 * edits `lib/pricing.ts` — and the client is holding the old number. So
 * nothing here carries a figure of its own: a tier is a `PricingSelection`,
 * and every dollar on every page comes back out of `calculatePrice`.
 *
 * The same goes for the words. Each line item's "what it is" and "why it
 * matters" are `ADD_ONS[key].description` and `.benefit`, and the jargon page
 * is `findGlossaryTerms()` run over the finished document — so a brochure
 * cannot explain a term differently from how the rep explains it on the call,
 * and cannot quietly stop explaining one that got added to a tier later.
 *
 * What a brochure file *does* own is the part no catalogue knows: what this
 * particular business is, what the concept did about it, and which of the
 * screenshots goes where.
 */

import {
  ADD_ONS,
  BASE_SERVICES,
  calculatePrice,
  formatCents,
  instalmentSchedule,
  ADD_ON_REQUIRES,
  type AddOnKey,
  type PricingBreakdown,
  type PricingSelection,
} from '@/lib/pricing';
import { findGlossaryTerms, type GlossaryEntry } from '@/lib/glossary';

export type TierKey = 'essential' | 'recommended' | 'complete';

/** One priced line as the brochure states it. */
export interface BrochureLine {
  key: AddOnKey;
  label: string;
  /** What it is. */
  description: string;
  /** What it gets you — the sentence that belongs in a brochure. */
  benefit: string;
  price: string;
  /**
   * Billed every month after the first, which the price includes.
   *
   * Worth carrying on the line rather than working out at render time: a
   * brochure that prints a monthly fee as though it were a one-off is
   * quoting the wrong number, and the catalogue is the only thing that
   * knows which items those are.
   */
  recurring: boolean;
}

export interface BrochureTier {
  key: TierKey;
  /** The name on the page — "The essentials", not "Tier 1". */
  name: string;
  /** One line under the name. */
  tagline: string;
  /** Who this is the right answer for, said plainly. */
  forWho: string;
  selection: PricingSelection;
  breakdown: PricingBreakdown;
  total: string;
  lines: BrochureLine[];
  /** What this tier adds on top of the one before it. Empty for the first. */
  addedLines: BrochureLine[];
}

/**
 * Work that isn't in the catalogue as a single line, described in the
 * client's terms and priced from the catalogue parts it's actually built out
 * of.
 *
 * This is the honest way to quote bespoke work in a document that goes out
 * before anyone has scoped it. "Quoted separately" tells a client nothing;
 * a made-up number is worse. Naming the parts gives a real figure and shows
 * the arithmetic behind it.
 */
export interface BrochureCustomItem {
  label: string;
  /** What it is, for someone who has never commissioned software. */
  what: string;
  /** Why it's worth it for this business — phrased as an offer, not a
   * diagnosis, because we haven't audited how they work today. */
  why: string;
  builtFrom: AddOnKey[];
  /** The lowest tier that includes it, or null if it's an extra either way. */
  includedIn: TierKey | null;
}

export interface BrochureSection {
  /** Short label in the running header. */
  eyebrow: string;
  title: string;
  /** One or two sentences. Brochure pages die of paragraphs. */
  body: string;
}

/** A screenshot of the concept, with the thing it is evidence of. */
export interface BrochureShot {
  src: string;
  alt: string;
  /** The caption printed beneath it. */
  caption: string;
  /**
   * The screenshot's real pixel size.
   *
   * Carried so the frame around it can take the picture's shape. Without it
   * the frame is whatever height the page has spare, and the picture either
   * gets cropped to fill it — shaving the first character off every line of
   * the copy the page is arguing about — or floats in a slab of dead colour.
   */
  width: number;
  height: number;
}

export interface BrochureInput {
  slug: string;
  /** The prospect. */
  company: string;
  /** Their line, as their own site says it. */
  strapline: string;
  /** Where the concept is deployed. */
  conceptUrl: string;
  /** Their site. Only ever printed, never characterised — see the note on
   * `comparison` below. */
  currentUrl: string;
  city: string;
  /** The colours the concept is built in, so the brochure matches it. */
  theme: BrochureTheme;
  cover: { eyebrow: string; title: string; standfirst: string };
  /** The narrative pages, in order. Each one pairs prose with screenshots. */
  chapters: BrochureChapter[];
  tiers: BrochureTier[];
  customItems: BrochureCustomItem[];
  /** What happens after they say yes. */
  nextSteps: string[];
  /**
   * Anything about the pricing a client would otherwise have to ask about,
   * printed under the comparison table.
   *
   * Data rather than a rule in the renderer because the questions are
   * specific to which add-ons this particular quote happens to combine —
   * one option replacing another with a larger version of itself leaves a
   * gap in the table that only a sentence can close.
   */
  pricingNotes?: string[];
  /**
   * The last line of the document, in the client's own language where they
   * have one worth borrowing. Optional — a brochure with nothing to quote
   * ends on the contact details rather than on something invented for it.
   */
  signOff?: string;
  /**
   * The "your site today vs this one" pages.
   *
   * Deliberately optional and deliberately empty by default. A comparison is
   * only worth printing if somebody actually looked at the current site, and
   * a brochure that invents a criticism of a prospect's website is worse than
   * one that never mentions it — they know their own site, and one wrong
   * claim costs the whole document its credibility.
   */
  comparison?: BrochureComparisonRow[];
}

export interface BrochureTheme {
  paper: string;
  paperDeep: string;
  ink: string;
  bronze: string;
  slate: string;
  line: string;
}

export interface BrochureChapter {
  section: BrochureSection;
  shots: BrochureShot[];
  /** Optional supporting facts, each a short label and a value. */
  facts?: { label: string; value: string }[];
  /** Optional pull quote, printed in the concept's serif. */
  quote?: { text: string; attribution: string };
}

/** One observed difference. Both sides must be things someone actually saw. */
export interface BrochureComparisonRow {
  what: string;
  today: string;
  concept: string;
}

export interface Brochure extends Omit<BrochureInput, 'tiers'> {
  tiers: BrochureTier[];
  /** Every jargon term that survived into the finished document. */
  glossary: GlossaryEntry[];
  /** How the recommended tier gets paid for. */
  schedule: { label: string; trigger: string; amount: string }[];
  pageCount: number;
}

/** Catalogue price for a set of add-ons, counting each one once. */
export function sumAddOns(keys: AddOnKey[]): number {
  const seen = new Set<AddOnKey>();
  let total = 0;
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    total += ADD_ONS[key].price;
  }
  return total;
}

/**
 * Pulls in whatever an add-on silently depends on.
 *
 * Bookings need somewhere to keep availability, a dashboard needs something
 * to be a dashboard *of*. The checkout adds those automatically, so a
 * brochure that listed the visible add-on alone would quote a price the
 * checkout then disagrees with — which is the one thing a document with
 * prices in it must never do.
 */
export function withDependencies(keys: AddOnKey[]): AddOnKey[] {
  const resolved = new Set<AddOnKey>();
  const visit = (key: AddOnKey) => {
    if (resolved.has(key)) return;
    resolved.add(key);
    for (const dep of ADD_ON_REQUIRES[key] ?? []) visit(dep as AddOnKey);
  };
  for (const key of keys) visit(key);
  return [...resolved];
}

function toLine(key: AddOnKey): BrochureLine {
  const addOn = ADD_ONS[key];
  return {
    key,
    label: addOn.label,
    description: addOn.description,
    benefit: addOn.benefit,
    price: formatCents(addOn.price),
    recurring: addOn.category === 'ongoing-care',
  };
}

export interface TierInput {
  key: TierKey;
  name: string;
  tagline: string;
  forWho: string;
  selection: PricingSelection;
}

/**
 * Prices a tier and works out what it adds over the one before it.
 *
 * The "what's new here" column is the whole reason the three-tier page
 * persuades anyone: a client comparing three long identical lists reads
 * none of them.
 */
export function buildTiers(inputs: TierInput[]): BrochureTier[] {
  const tiers: BrochureTier[] = [];
  let previous: Set<AddOnKey> = new Set();

  for (const input of inputs) {
    const addOns = withDependencies(input.selection.addOns);
    const selection: PricingSelection = { ...input.selection, addOns };
    const breakdown = calculatePrice(selection);
    const lines = addOns.map(toLine);

    tiers.push({
      ...input,
      selection,
      breakdown,
      total: formatCents(breakdown.totalPrice),
      lines,
      addedLines: lines.filter((line) => !previous.has(line.key)),
    });
    previous = new Set(addOns);
  }

  return tiers;
}

/**
 * Every line any option includes, in the order a reader meets them.
 *
 * Not the top tier's lines, which is a different set and the obvious thing
 * to reach for. A middle tier can carry something the top one replaces with
 * a larger version of itself — a maintenance plan superseded by a growth
 * plan — and taking the top tier as the master list silently drops that row,
 * so the card says twelve items and the table beneath it shows eleven.
 */
export function comparisonLines(tiers: BrochureTier[]): BrochureLine[] {
  const seen = new Set<AddOnKey>();
  return tiers
    .flatMap((tier) => tier.addedLines)
    .filter((line) => !seen.has(line.key) && seen.add(line.key));
}

export function customItemPrice(item: BrochureCustomItem): string {
  return formatCents(sumAddOns(withDependencies(item.builtFrom)));
}

/** The catalogue lines a custom item is assembled from, priced individually. */
export function customItemParts(item: BrochureCustomItem): BrochureLine[] {
  return withDependencies(item.builtFrom).map(toLine);
}

/**
 * Every word of prose the finished brochure prints, concatenated.
 *
 * Used to decide which glossary terms earn a place on the plain-English
 * page. Running it over the assembled document rather than a hand-kept list
 * is what stops the two drifting apart: add "conversion rate optimization"
 * to a tier and its definition turns up on its own.
 */
export function brochureProse(input: BrochureInput): string {
  const parts: string[] = [input.cover.standfirst, input.strapline];

  for (const chapter of input.chapters) {
    parts.push(chapter.section.title, chapter.section.body);
    for (const shot of chapter.shots) parts.push(shot.caption);
  }
  for (const tier of input.tiers) {
    parts.push(tier.tagline, tier.forWho);
    for (const line of tier.lines) parts.push(line.label, line.description, line.benefit);
  }
  for (const item of input.customItems) parts.push(item.label, item.what, item.why);
  for (const row of input.comparison ?? []) parts.push(row.what, row.today, row.concept);
  parts.push(...input.nextSteps);

  return parts.join('\n');
}

/**
 * How many pages the document comes to.
 *
 * Kept in step with the renderer by counting the same things it renders,
 * in the same order — the folio printed on page 9 has to agree with the
 * "of 16" printed beside it, and a page added to one and not the other is
 * exactly the kind of error nobody notices until a client does.
 */
export function countPages(input: BrochureInput): number {
  const COVER = 1;
  // Custom work, side by side, plain English, what happens next.
  const CLOSING = 4;
  const comparison = (input.comparison?.length ?? 0) > 0 ? 1 : 0;
  return COVER + input.chapters.length + comparison + input.tiers.length + CLOSING;
}

export function buildBrochure(input: BrochureInput): Brochure {
  const recommended = input.tiers.find((tier) => tier.key === 'recommended') ?? input.tiers[0];

  return {
    ...input,
    glossary: findGlossaryTerms(brochureProse(input)),
    schedule: instalmentSchedule(recommended.breakdown.totalPrice).map((instalment) => ({
      label: instalment.label,
      trigger: instalment.triggerLabel,
      amount: formatCents(instalment.amountCents),
    })),
    pageCount: countPages(input),
  };
}

export { BASE_SERVICES, formatCents };
