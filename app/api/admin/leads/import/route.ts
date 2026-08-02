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
};

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
      if (key.includes('coldemail') || ((key.includes('personalized') || key.includes('personalised')) && key.includes('email'))) {
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
 * dedicated column for them yet). Header matching is tolerant of
 * real-world spelling/spacing — see
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

        // Strip currency symbols/commas ("$15,313" -> "15313") before parsing —
        // research CSVs format the value for human readability, not parseFloat.
        const cleanedValue = (row.estimatedvalue || '').replace(/[^0-9.]/g, '');
        const dollars = parseFloat(cleanedValue);
        const estimatedValue = !isNaN(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;

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
