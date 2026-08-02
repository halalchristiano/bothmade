import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus, isPainPointKey } from '@/lib/leads';

const MAX_ROWS = 500;

// Strips everything but letters/digits so "Public email", "public_email" and
// "email" all collapse to the same comparable key regardless of spacing,
// punctuation, or casing — CSVs from research tools rarely use our exact
// internal field names verbatim.
const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

// Exact-match aliases for header wordings seen in practice. Checked first,
// before the looser includes()-based fallback below.
const HEADER_ALIASES: Record<string, string> = {
  company: 'company',
  businessname: 'company',
  companyname: 'company',
  contactname: 'contactname',
  contact: 'contactname',
  phone: 'phone',
  phonenumber: 'phone',
  email: 'email',
  publicemail: 'email',
  emailaddress: 'email',
  source: 'source',
  estimatedvalue: 'estimatedvalue',
  estimatedprojectvalue: 'estimatedvalue',
  dealsize: 'estimatedvalue',
  painpoints: 'painpoints',
  notes: 'notes',
  status: 'status',
  personalisedcoldemail: 'personalisedcoldemail',
  personalizedcoldemail: 'personalisedcoldemail',
  personalizedobservation: 'personalizedobservation',
  personalisedobservation: 'personalizedobservation',
  mockupurl: 'mockupurl',
  mockuplink: 'mockupurl',
  industry: 'industry',
  address: 'address',
  originalwebsite: 'originalwebsite',
  existingwebsite: 'originalwebsite',
  website: 'originalwebsite',
  servicestopitch: 'servicestopitch',
  services: 'servicestopitch',
  salesnote: 'salesnote',
  noteforevan: 'salesnote',
  evannote: 'salesnote',
  strategynote: 'salesnote',
  currentwebsite: 'originalwebsite',
  thingstheyneed: 'needfreeform',
  whattheyneed: 'needfreeform',
  lowestestimate: 'estimatelow',
  lowestimate: 'estimatelow',
  minimumestimate: 'estimatelow',
  highestestimate: 'estimatehigh',
  highestimate: 'estimatehigh',
  maximumestimate: 'estimatehigh',
  range: 'estimaterange',
  estimaterange: 'estimaterange',
  pricerange: 'estimaterange',
};

// "$15,000" -> 1500000 cents. Returns null for anything that isn't a number.
function parseMoneyCents(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const dollars = parseFloat(cleaned);
  return !isNaN(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;
}

// "$15,000 - $30,000" -> [1500000, 3000000]. Used only to backfill a low/high
// that weren't given as their own columns.
function parseMoneyRange(raw: string | undefined): [number | null, number | null] {
  if (!raw) return [null, null];
  const parts = raw.split(/[-–—]|\bto\b/i).map((p) => parseMoneyCents(p));
  const nums = parts.filter((n): n is number => n !== null);
  if (nums.length === 0) return [null, null];
  if (nums.length === 1) return [nums[0], null];
  return [Math.min(...nums), Math.max(...nums)];
}

/**
 * Gathers "Pain point 1", "Pain point 2", ... style columns into a single
 * newline-separated block, in numeric order (so 10 lands after 9, not after
 * 1). Any freeform column covering the same ground is appended, split on
 * newlines and semicolons so one cell can carry several points.
 *
 * Each resulting line is expected to read "Point: explanation for this
 * business" — see parseSalesPoints() for how it's read back.
 */
function collectNumberedPoints(
  row: Record<string, string>,
  prefix: string,
  freeformKey?: string
): string | null {
  const numbered = Object.entries(row)
    .map(([key, value]) => {
      const match = key.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? { n: parseInt(match[1], 10), value: value.trim() } : null;
    })
    .filter((x): x is { n: number; value: string } => !!x && !!x.value)
    .sort((a, b) => a.n - b.n)
    .map((x) => x.value);

  const freeform = freeformKey && row[freeformKey] ? row[freeformKey] : '';
  const extra = freeform
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const all = [...numbered, ...extra];
  return all.length > 0 ? all.join('\n') : null;
}

/**
 * Maps a raw CSV row (keyed however the header row happened to read) onto
 * our canonical field names. Falls back to substring matching for anything
 * the exact alias table doesn't cover, so a header like "One-line
 * observation: where they're lacking" or "Personalized cold email" still
 * lands in the right field instead of silently vanishing because it wasn't
 * spelled exactly "personalizedobservation".
 */
function normalizeRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(row)) {
    if (!value) continue;
    const key = normalizeKey(rawKey);
    let canonical = HEADER_ALIASES[key];
    if (!canonical) {
      // Numbered point columns ("Pain point 3", "Upsell point 10") pass
      // through untouched — collectNumberedPoints() gathers them later.
      // Checked first so the looser branches below can't swallow them.
      if (/^(painpoint|essentialpoint|upsellpoint)\d+$/.test(key)) {
        canonical = key;
      } else if (key.includes('upsold') || key.includes('upsell')) {
        canonical = 'upsellfreeform';
      } else if (key.includes('essential')) {
        canonical = 'needfreeform';
      } else if (key.includes('coldemail') || ((key.includes('personalized') || key.includes('personalised')) && key.includes('email'))) {
        canonical = 'personalisedcoldemail';
      } else if (key.includes('observation')) {
        canonical = 'personalizedobservation';
      } else if (key.includes('email')) {
        canonical = 'email';
      } else if (key.includes('value') || key.includes('price') || key.includes('budget')) {
        canonical = 'estimatedvalue';
      } else if (key.includes('mockup')) {
        canonical = 'mockupurl';
      } else if (key.includes('website') || key.includes('url')) {
        canonical = 'originalwebsite';
      } else if (key.includes('service')) {
        canonical = 'servicestopitch';
      } else if (key.includes('phone') || key.includes('tel')) {
        canonical = 'phone';
      } else if (key.includes('contact') || key.includes('name')) {
        canonical = 'contactname';
      } else if (key.includes('note') && (key.includes('evan') || key.includes('sales') || key.includes('strateg'))) {
        canonical = 'salesnote';
      } else if (key.includes('note')) {
        canonical = 'notes';
      } else {
        canonical = key;
      }
    }
    // First non-empty value wins if two source columns map to the same field.
    if (!out[canonical]) out[canonical] = value;
  }
  return out;
}

/**
 * Bulk-import leads from a CSV. Recognized columns: company (required),
 * contactname, email, phone, source, estimatedvalue (dollars), painpoints
 * (semicolon-separated keys), notes, status. Also accepts a few optional
 * research columns produced by external prep work — personalisedcoldemail
 * (a full "Subject: ...\n\n<body>" draft, stored as-is for one-click
 * sending), personalizedobservation / personalisedobservation (a short
 * one-liner — pre-fills the "personalized observation" field the
 * cold-outreach templates require), mockupurl (stored on the lead's
 * mockupUrl field — powers the Loom/mockup link default in the email
 * composer), originalwebsite (their existing site — its own field, shown
 * as a one-click link on the lead detail page), salesnote (a strategic
 * note for whoever works the lead, distinct from general notes), and
 * address, industry, servicestopitch (folded into notes since there's no
 * dedicated column for them yet).
 *
 * It also accepts the hand-written sales brief columns: "Pain point 1..N",
 * "Essential point 1..N" and "Upsell point 1..N", each cell written as
 * "Point: explanation for this specific business", plus the freeform
 * equivalents ("Things they need", "Things they could be upsold on") and
 * the quotable range ("Lowest estimate", "Highest estimate", or a single
 * "Range" column). Numbered columns are gathered in numeric order into one
 * newline-separated block per group.
 *
 * Header matching is tolerant of real-world spelling/spacing — see
 * normalizeRow() — since research CSVs rarely use our exact field names.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { rows, fileName } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Max ${MAX_ROWS} rows per import` }, { status: 400 });
    }

    let skipped = 0;
    const toCreate = rows
      .map((rawRow: Record<string, string>) => {
        const row = normalizeRow(rawRow);
        const company = (row.company || '').trim();
        if (!company) {
          skipped++;
          return null;
        }

        const painPoints = (row.painpoints || '')
          .split(/[;,]/)
          .map((p) => p.trim())
          .filter(isPainPointKey)
          .join(',');

        // Research CSVs format money for human readability, not parseFloat.
        const estimatedValue = parseMoneyCents(row.estimatedvalue);

        // Low/high win over the combined range column; the range only fills
        // in whichever end wasn't given explicitly.
        const [rangeLow, rangeHigh] = parseMoneyRange(row.estimaterange);
        const estimateLowCents = parseMoneyCents(row.estimatelow) ?? rangeLow;
        const estimateHighCents = parseMoneyCents(row.estimatehigh) ?? rangeHigh;

        const customPainPoints = collectNumberedPoints(row, 'painpoint');
        const essentialPoints = collectNumberedPoints(row, 'essentialpoint', 'needfreeform');
        const upsellPoints = collectNumberedPoints(row, 'upsellpoint', 'upsellfreeform');

        const status = isLeadStatus(row.status?.trim()) ? row.status.trim() : undefined;

        // Extra research columns don't have dedicated fields yet — fold
        // whatever's present into notes rather than silently dropping it.
        const extra = [
          row.industry ? `Industry: ${row.industry.trim()}` : '',
          row.address ? `Address: ${row.address.trim()}` : '',
          row.servicestopitch ? `Services to pitch: ${row.servicestopitch.trim()}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        const notes = [row.notes?.trim(), extra].filter(Boolean).join('\n\n') || null;

        return {
          company,
          contactName: row.contactname || null,
          email: row.email?.includes('@') ? row.email.trim() : null,
          phone: row.phone || null,
          source: row.source || null,
          estimatedValue,
          painPoints,
          notes,
          status,
          coldEmailDraft: row.personalisedcoldemail?.trim() || null,
          personalizedObservation:
            row.personalizedobservation?.trim() || row.personalisedobservation?.trim() || null,
          mockupUrl: row.mockupurl?.trim() || null,
          originalWebsite: row.originalwebsite?.trim() || null,
          salesNote: row.salesnote?.trim() || null,
          customPainPoints,
          essentialPoints,
          upsellPoints,
          estimateLowCents,
          estimateHighCents,
          assignedToId: session.userId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (toCreate.length === 0) {
      await prisma.csvImportLog.create({
        data: {
          fileName: typeof fileName === 'string' ? fileName.slice(0, 255) : null,
          rowCount: rows.length,
          importedCount: 0,
          skippedCount: skipped,
          importedById: session.userId,
        },
      });
      return NextResponse.json({ error: 'No valid rows — every row needs a company name' }, { status: 400 });
    }

    const created = await prisma.$transaction(toCreate.map((data) => prisma.lead.create({ data })));

    await prisma.csvImportLog
      .create({
        data: {
          fileName: typeof fileName === 'string' ? fileName.slice(0, 255) : null,
          rowCount: rows.length,
          importedCount: created.length,
          skippedCount: skipped,
          importedById: session.userId,
        },
      })
      .catch((err) => console.error('Failed to record CSV import log:', err));

    return NextResponse.json({ success: true, count: created.length, skipped }, { status: 201 });
  } catch (error) {
    console.error('Lead CSV import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
