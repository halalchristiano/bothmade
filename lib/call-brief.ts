// The call brief, derived once.
//
// The lead detail page composes the research dossier (hand-written CSV
// columns beat heuristics), the playbook, and the pricing estimate into the
// script a rep reads on a live call. That wiring lived inline in a
// 3,600-line page component, which meant any second surface wanting the
// same brief — Call HQ — would either fork it or reach into a page for it.
// This is that wiring, extracted verbatim: same precedence rules, same
// numbers, one home.

import {
  PAIN_POINTS,
  parseSalesPoints,
  type PainPointKey,
  type SalesPoint,
} from '@/lib/leads';
import {
  PAIN_POINT_BRIEFS,
  buildSalesRecommendations,
  classifyWrittenPoint,
  inferPainPointsFromNotes,
} from '@/lib/pricing';
import { buildCallScript, type ScriptBlock } from '@/lib/call-script';

export interface CallBriefLead {
  company: string;
  contactName: string | null;
  notes: string | null;
  customPainPoints: string | null;
  essentialPoints: string | null;
  upsellPoints: string | null;
  /** Comes off the wire as the stored comma-string; an already-parsed array is accepted too. */
  painPoints: string | PainPointKey[];
  estimateLowCents: number | null;
  estimateHighCents: number | null;
  /** The one-line verdict from the research CSV. Optional so older callers still compile. */
  personalizedObservation?: string | null;
  /** The written assessment of the site they have now. */
  currentSiteAssessment?: string | null;
  assignedTo?: { name: string | null } | null;
}

export interface CallBrief {
  script: ScriptBlock[];
  low: number;
  high: number;
  pains: SalesPoint[];
  essentials: SalesPoint[];
  upsells: SalesPoint[];
}

export function buildLeadBrief(lead: CallBriefLead): CallBrief {
  // Hand-written content from the research CSV always wins over the generic
  // heuristics — a human who actually looked at the business beats a lookup
  // table. The heuristics stay as the fallback.
  const writtenPains = parseSalesPoints(lead.customPainPoints);
  const writtenNeeds = parseSalesPoints(lead.essentialPoints);
  const writtenUpsell = parseSalesPoints(lead.upsellPoints);

  // The DB stores painPoints as a comma-separated string and the lead API
  // returns it verbatim — spreading a string iterates its CHARACTERS, which
  // crashed the cockpit on the most common lead shape. Normalize first, and
  // keep only keys the catalogue actually knows.
  const painKeys: PainPointKey[] = (
    Array.isArray(lead.painPoints)
      ? lead.painPoints
      : String(lead.painPoints ?? '')
          .split(',')
          .map((k) => k.trim())
  ).filter((k): k is PainPointKey => k in PAIN_POINTS);

  const inferred =
    writtenPains.length > 0 ? [] : inferPainPointsFromNotes(lead.notes, painKeys);
  const allPains = [...painKeys, ...inferred];
  const recs = buildSalesRecommendations(allPains);

  // A checklist pain point already covered by a bespoke one would show the
  // same problem twice with the same script attached.
  const coveredByWritten = new Set(
    writtenPains.map((p) => classifyWrittenPoint(p.point, p.explanation)).filter(Boolean)
  );
  const checklistPains = allPains.filter((k) => !coveredByWritten.has(k));

  const low = lead.estimateLowCents ?? recs.coreTotal;
  const high = lead.estimateHighCents ?? recs.maxTotal;

  const asPoint = (point: string, explanation: string | null): SalesPoint => ({
    point,
    explanation,
    priceCents: null,
    isCustom: false,
  });

  /*
   * The research we already hold, when nobody filled in the numbered columns.
   *
   * A lead imported from a research CSV carries a one-line verdict on the
   * business and often a written assessment of its site — but the brief only
   * ever read the numbered painPointN columns, so a thousand leads with real
   * research on them produced a script with no reason to call in it. The rep
   * got an opening line, a price, and nothing in between.
   *
   * So the observation becomes the lead pain point when there is nothing
   * better. It is weaker than a point somebody priced deliberately, which is
   * why it only ever runs last — but it is a sentence about THIS business,
   * which beats the checklist's generic wording, so when it exists it goes
   * first and the checklist tags follow it as the other things noticed.
   */
  const observed = observationAsPoint(lead);
  const checklistAsPoints = checklistPains.map((k) =>
    asPoint(PAIN_POINTS[k], PAIN_POINT_BRIEFS[k]?.problem ?? null)
  );

  const pains =
    writtenPains.length > 0 ? writtenPains : [...observed, ...checklistAsPoints];
  const essentials =
    writtenNeeds.length > 0
      ? writtenNeeds
      : recs.needs.map((n) => asPoint(n.label, n.description));
  const upsells =
    writtenUpsell.length > 0
      ? writtenUpsell
      : recs.upsell.map((n) => asPoint(n.label, n.description));

  const script = buildCallScript({
    company: lead.company,
    contactName: lead.contactName,
    repName: lead.assignedTo?.name ?? null,
    writtenPains: pains,
    checklistPainKeys: checklistPains,
    essentials,
    upsells,
    low,
    high,
  });

  return { script, low, high, pains, essentials, upsells };
}

/**
 * The imported one-liner, turned into something the script can open with.
 *
 * `personalizedObservation` is written as a verdict ("No pricing anywhere and
 * the gallery is eleven phone photos") rather than a label, so it is used as
 * the point itself and the site assessment becomes the explanation beneath
 * it. Where only the assessment exists, that is the point — a long sentence
 * in the lead slot still beats an empty script.
 *
 * Returns an array so the caller can spread it: none of this is guaranteed to
 * be there, and a lead with neither field should add nothing rather than a
 * point with no text in it.
 */
function observationAsPoint(lead: CallBriefLead): SalesPoint[] {
  const observation = lead.personalizedObservation?.trim() || '';
  const assessment = lead.currentSiteAssessment?.trim() || '';
  const point = observation || assessment;
  if (!point) return [];

  return [
    {
      point,
      // Never repeat the assessment underneath itself when it IS the point.
      explanation: observation && assessment ? assessment : null,
      priceCents: null,
      isCustom: false,
    },
  ];
}
