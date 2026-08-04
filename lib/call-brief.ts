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
  painPoints: PainPointKey[];
  estimateLowCents: number | null;
  estimateHighCents: number | null;
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

  const inferred =
    writtenPains.length > 0 ? [] : inferPainPointsFromNotes(lead.notes, lead.painPoints);
  const allPains = [...lead.painPoints, ...inferred];
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

  const pains =
    writtenPains.length > 0
      ? writtenPains
      : checklistPains.map((k) => asPoint(PAIN_POINTS[k], PAIN_POINT_BRIEFS[k]?.problem ?? null));
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
