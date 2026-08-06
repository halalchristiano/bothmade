/**
 * What the enquiry form asks, and the brief it writes.
 *
 * The form used to be a message box. Somebody typed a paragraph, it landed in
 * `notes`, and the lead opened on "Nothing to brief you on yet" — because the
 * brief reads structured pain points and a paragraph is not one. Every
 * inbound lead therefore arrived needing the same work a cold lead needs,
 * despite the prospect having already told us what was wrong.
 *
 * So the form asks in the vocabulary the rest of the system already speaks.
 * The tick boxes emit `PainPointKey`s — the same keys the research CSV
 * imports, the same keys `PAIN_POINT_BRIEFS` explains and prices against — so
 * an enquiry arrives with the brief already written, the recommended work
 * already chosen, and the estimate already computed. Nothing is inferred and
 * nothing is transcribed by hand.
 *
 * Free text still exists, but it is now the "anything else" at the end rather
 * than the whole enquiry.
 */

import { PAIN_POINTS, type PainPointKey, isPainPointKey } from '@/lib/leads';
import { ADD_ONS, PAIN_POINT_BRIEFS, type AddOnKey } from '@/lib/pricing';
import { SALES_GLOSSARY, type GlossaryEntry } from '@/lib/glossary';

/**
 * The tick boxes, in the order they are asked.
 *
 * Written as the visitor would say it, not as the CRM stores it — "People
 * can't book or buy without ringing" is a thing a plumber recognises about
 * their own business; "no-booking, no-ecommerce" is not. The key underneath
 * is what makes the brief write itself.
 */
export interface EnquiryProblem {
  key: PainPointKey;
  /** How it is put to the person filling the form in. */
  ask: string;
}

export const ENQUIRY_PROBLEMS: EnquiryProblem[] = [
  { key: 'no-website', ask: "We don't have a website at all" },
  { key: 'outdated-design', ask: 'It looks dated next to our competitors' },
  { key: 'not-mobile-friendly', ask: 'It is awkward or broken on a phone' },
  { key: 'slow-site', ask: 'It takes too long to load' },
  { key: 'poor-seo', ask: 'People cannot find us on Google' },
  { key: 'no-analytics', ask: 'We have no idea who visits or what they do' },
  { key: 'no-booking', ask: 'Customers cannot book or enquire without ringing' },
  { key: 'no-ecommerce', ask: 'We cannot sell or take payment online' },
  { key: 'manual-processes', ask: 'Too much of the admin is still done by hand' },
  { key: 'disconnected-tools', ask: 'Our systems do not talk to each other' },
  { key: 'weak-branding', ask: 'The branding is inconsistent or dated' },
  { key: 'no-app', ask: 'We want an app and do not have one' },
  { key: 'scaling-issues', ask: 'What we have cannot cope as we grow' },
  { key: 'security-concerns', ask: 'We have security or compliance worries' },
];

/** Keeps anything that is not one of ours, so a hand-made POST cannot seed junk. */
export function parseProblems(raw: unknown): PainPointKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<PainPointKey>();
  for (const value of raw) {
    if (typeof value === 'string' && isPainPointKey(value)) seen.add(value);
  }
  // Asked order, not the order they happened to arrive in.
  return ENQUIRY_PROBLEMS.filter((p) => seen.has(p.key)).map((p) => p.key);
}

/**
 * What we would do about what they ticked, in the order the brief reads it.
 *
 * `needs` comes first because it is the work the problem actually requires;
 * `upsell` follows as the thing worth raising on the call. Deduplicated,
 * because two problems frequently want the same fix and a client reading the
 * same line twice assumes they are being charged twice.
 */
export function recommendedWork(problems: PainPointKey[]): {
  needs: AddOnKey[];
  worthRaising: AddOnKey[];
} {
  const needs = new Set<AddOnKey>();
  const upsell = new Set<AddOnKey>();

  for (const key of problems) {
    const brief = PAIN_POINT_BRIEFS[key];
    for (const k of brief.needs) needs.add(k);
    for (const k of brief.upsell) upsell.add(k);
  }
  // Anything genuinely required stops being an optional extra.
  for (const k of needs) upsell.delete(k);

  return { needs: [...needs], worthRaising: [...upsell] };
}

/** One thing we would do, as the client reads it. Deliberately no price. */
export interface EnquiryOption {
  label: string;
  /** What it gets them, from the catalogue — not written per-enquiry. */
  benefit: string;
  /** What it is, when the label alone is jargon. */
  explain: string | null;
}

/**
 * The plain-English gloss for a catalogue label, with an example.
 *
 * "CRM & Lead Capture Setup" means nothing to a plumber, and a brochure that
 * lists it unexplained is a brochure that gets skimmed. The definition comes
 * from lib/glossary so the website, the brief and the rep on the call all
 * explain a word the same way.
 */
function explainLabel(label: string, description: string): string | null {
  const haystack = `${label} ${description}`.toLowerCase();
  const entry: GlossaryEntry | undefined = SALES_GLOSSARY.find((g) =>
    [g.term, ...(g.aliases ?? [])].some((form) =>
      new RegExp(`\\b${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack)
    )
  );
  if (!entry) return null;
  // `sayIt` is the sentence written to be said to a customer; `plain` is the
  // fuller one. Both, because the ask was a definition *and* an example.
  return entry.sayIt ? `${entry.plain} In practice: ${entry.sayIt}` : entry.plain;
}

export function toOptions(keys: AddOnKey[]): EnquiryOption[] {
  return keys.map((key) => {
    const addOn = ADD_ONS[key];
    return {
      label: addOn.label,
      benefit: addOn.benefit,
      explain: explainLabel(addOn.label, addOn.description),
    };
  });
}

/**
 * The strategic note the rep reads first.
 *
 * Their own words where they wrote any, and the problems they ticked stated
 * back as problems rather than as keys. This is what turns "Nothing to brief
 * you on yet" into a lead somebody can ring.
 */
export function buildSalesNote(problems: PainPointKey[], message: string): string {
  const lines: string[] = [];

  if (message.trim()) {
    lines.push(`In their words: "${message.trim()}"`);
  }
  if (problems.length > 0) {
    lines.push('');
    lines.push('They told us this is what is wrong:');
    for (const key of problems) lines.push(`• ${PAIN_POINTS[key]}`);
  }
  if (lines.length === 0) return '';

  lines.push('');
  lines.push('Came in through the website, so they are already looking. Ring them.');
  return lines.join('\n');
}
