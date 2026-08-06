import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import {
  isLeadStatus,
  isPainPointKey,
  parseSalesPoints,
  formatSalesPoints,
  type SalesPoint,
} from '@/lib/leads';
import { resolvePointPrices, sizeCompany } from '@/lib/lead-pricing';
import { normalizeMockupUrl } from '@/lib/mockups';
import type { PlaybookEntry } from '@/lib/playbook-seed';

/**
 * A scrape comes off the tool in thousands, and splitting one into files by
 * hand is exactly the kind of chore that ends with a batch imported twice or
 * not at all. A thousand rows is one create per row inside a transaction —
 * heavier than the old cap and still comfortably inside a request.
 */
const MAX_ROWS = 1000;

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
  contactrole: 'contactrole',
  role: 'contactrole',
  jobtitle: 'contactrole',
  title: 'contactrole',
  position: 'contactrole',
  phone: 'phone',
  phonenumber: 'phone',
  altphone: 'altphone',
  secondphone: 'altphone',
  mobile: 'altphone',
  email: 'email',
  publicemail: 'email',
  emailaddress: 'email',
  source: 'source',
  estimatedvalue: 'estimatedvalue',
  estimatedprojectvalue: 'estimatedvalue',
  dealsize: 'estimatedvalue',
  painpoints: 'painpoints',
  painpointtags: 'painpoints',
  notes: 'notes',
  status: 'status',
  personalisedcoldemail: 'personalisedcoldemail',
  personalizedcoldemail: 'personalisedcoldemail',
  mockupemail: 'mockupemail',
  mockupemaildraft: 'mockupemail',
  personalisedmockupemail: 'mockupemail',
  personalizedmockupemail: 'mockupemail',
  secondemail: 'mockupemail',
  followupemail: 'mockupemail',
  personalizedobservation: 'personalizedobservation',
  personalisedobservation: 'personalizedobservation',
  mockupurl: 'mockupurl',
  mockuplink: 'mockupurl',
  mockuppdf: 'mockuppdfurl',
  mockuppdfurl: 'mockuppdfurl',
  mockuppdflink: 'mockuppdfurl',
  vercelpassword: 'vercelpassword',
  verceldeploymentpassword: 'vercelpassword',
  deploymentpassword: 'vercelpassword',
  previewpassword: 'vercelpassword',
  sitepassword: 'vercelpassword',
  invoicepdf: 'invoicepdfurl',
  invoicepdfurl: 'invoicepdfurl',
  invoiceurl: 'invoicepdfurl',
  industry: 'industry',
  sector: 'industry',
  niche: 'industry',
  address: 'address',
  streetaddress: 'address',
  city: 'city',
  town: 'city',
  state: 'region',
  region: 'region',
  county: 'region',
  province: 'region',
  postcode: 'postalcode',
  postalcode: 'postalcode',
  zip: 'postalcode',
  zipcode: 'postalcode',
  country: 'country',
  timezone: 'timezone',
  tz: 'timezone',
  companysize: 'companysize',
  size: 'companysize',
  employeecount: 'employeecount',
  employees: 'employeecount',
  staff: 'employeecount',
  headcount: 'employeecount',
  locationcount: 'locationcount',
  locations: 'locationcount',
  branches: 'locationcount',
  annualrevenue: 'annualrevenue',
  revenue: 'annualrevenue',
  turnover: 'annualrevenue',
  yearfounded: 'yearfounded',
  founded: 'yearfounded',
  established: 'yearfounded',
  googlerating: 'googlerating',
  rating: 'googlerating',
  stars: 'googlerating',
  googlereviewcount: 'googlereviewcount',
  reviewcount: 'googlereviewcount',
  reviews: 'googlereviewcount',
  googlemapsurl: 'googlemapsurl',
  googlemaps: 'googlemapsurl',
  mapsurl: 'googlemapsurl',
  instagram: 'instagramurl',
  instagramurl: 'instagramurl',
  facebook: 'facebookurl',
  facebookurl: 'facebookurl',
  linkedin: 'linkedinurl',
  linkedinurl: 'linkedinurl',
  tags: 'tags',
  labels: 'tags',
  donotcontact: 'donotcontact',
  dnc: 'donotcontact',
  optout: 'donotcontact',
  unsubscribed: 'donotcontact',
  donotcontactreason: 'donotcontactreason',
  leadscore: 'leadscore',
  score: 'leadscore',
  assignedto: 'assignedto',
  owner: 'assignedto',
  rep: 'assignedto',
  salesrep: 'assignedto',
  dateadded: 'dateadded',
  addeddate: 'dateadded',
  datecreated: 'dateadded',
  added: 'dateadded',
  timeadded: 'timeadded',
  addedtime: 'timeadded',
  clienttakenon: 'clienttakenon',
  dateclienttakenon: 'clienttakenon',
  datewon: 'clienttakenon',
  clientsince: 'clienttakenon',
  onboardedon: 'clienttakenon',
  nextfollowup: 'nextfollowup',
  followupdate: 'nextfollowup',
  originalwebsite: 'originalwebsite',
  existingwebsite: 'originalwebsite',
  website: 'originalwebsite',
  servicestopitch: 'servicestopitch',
  services: 'servicestopitch',
  salesnote: 'salesnote',
  noteforevan: 'salesnote',
  evannote: 'salesnote',
  strategynote: 'salesnote',
  currentwebsite: 'currentwebsite',
  currentsite: 'currentwebsite',
  websiteassessment: 'currentwebsite',
  siteverdict: 'currentwebsite',
  thingstheyneed: 'needfreeform',
  whattheyneed: 'needfreeform',
  certainupsells: 'upsellfreeform',
  lowestestimate: 'estimatelow',
  lowestimate: 'estimatelow',
  minimumestimate: 'estimatelow',
  highestestimate: 'estimatehigh',
  highestimate: 'estimatehigh',
  maximumestimate: 'estimatehigh',
  range: 'estimaterange',
  estimaterange: 'estimaterange',
  estimatedrange: 'estimaterange',
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

function parseIntOrNull(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseFloatOrNull(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// "yes" / "y" / "true" / "1" / "x" all mean yes. Everything else means no,
// including an empty cell — a suppression flag has to be opted into
// deliberately, never inferred from a stray character.
function parseBool(raw: string | undefined): boolean {
  if (!raw) return false;
  return ['yes', 'y', 'true', '1', 'x', 'checked'].includes(raw.trim().toLowerCase());
}

/**
 * Reads a date cell as DDMMYYYY — the format the team writes dates in, and
 * the one the filters are built around ("everything added between 01082026
 * and 31082026").
 *
 * Separators are optional and ISO is accepted too, because a spreadsheet
 * will silently reformat a date column the moment someone opens it, and
 * rejecting the result would mean losing dates to a tool nobody chose.
 * Ambiguity is resolved in favour of DDMMYYYY: 03082026 is 3 August, not
 * 8 March. An `atTime` of "14:30" sets the clock; without it the date lands
 * at midday, so a timezone shift can't roll it onto the day before.
 */
function parseDdmmyyyy(raw: string | undefined, atTime?: string): Date | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;

  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dmy = value.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{4})$/);
  const packed = value.match(/^(\d{2})(\d{2})(\d{4})$/);

  if (iso) [, year, month, day] = iso.map(Number) as [number, number, number, number];
  else if (dmy) [, day, month, year] = dmy.map(Number) as [number, number, number, number];
  else if (packed) [, day, month, year] = packed.map(Number) as [number, number, number, number];
  else return null;

  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;

  let hours = 12;
  let minutes = 0;
  const time = atTime?.trim().match(/^(\d{1,2}):(\d{2})/);
  if (time) {
    hours = Number(time[1]);
    minutes = Number(time[2]);
  }

  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  // Rolls over on a nonsense day (31 February), which means the cell was
  // wrong rather than merely oddly formatted.
  return date.getUTCMonth() === month - 1 ? date : null;
}

/**
 * Gathers "Pain point 1", "Pain point 2", ... style columns into an ordered
 * list of points, in numeric order (so 10 lands after 9, not after 1). There
 * is no cap on how many columns a sheet can carry — a business with eleven
 * things wrong with its site gets eleven columns.
 *
 * Each cell is expected to read "Point: explanation for this business", with
 * an optional price either inline ("... | $900") or in a matching
 * "<prefix> N price" column. Any freeform column covering the same ground is
 * appended, split on newlines and semicolons so one cell can carry several
 * points.
 */
function collectNumberedPoints(
  row: Record<string, string>,
  prefix: string,
  freeformKey?: string
): SalesPoint[] {
  const numbered = Object.entries(row)
    .map(([key, value]) => {
      const match = key.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? { n: parseInt(match[1], 10), value: value.trim() } : null;
    })
    .filter((x): x is { n: number; value: string } => !!x && !!x.value)
    .sort((a, b) => a.n - b.n)
    .flatMap(({ n, value }) => {
      const points = parseSalesPoints(value);
      // A dedicated price column is the more deliberate statement of the two,
      // so it overrides a price typed inline in the same cell.
      const columnPrice = parseMoneyCents(row[`${prefix}${n}price`]);
      if (columnPrice !== null && points[0]) points[0].priceCents = columnPrice;
      return points;
    });

  const freeform = freeformKey && row[freeformKey] ? row[freeformKey] : '';
  // Semicolons only separate points in a plain list ("SEO; analytics; CMS").
  // Once a cell is written as "Point: explanation", a semicolon is just
  // punctuation inside the prose, and splitting on it would cut a sentence
  // in half mid-thought.
  const splitOn = freeform.includes(':') ? /\n/ : /[\n;]/;
  const extra = freeform
    .split(splitOn)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((line) => parseSalesPoints(line));

  // The freeform column is a summary of the whole group, so it reads first;
  // the numbered columns are the specifics underneath it.
  return [...extra, ...numbered];
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
      // Numbered point columns ("Pain point 3", "Upsell point 10") and their
      // matching price columns ("Essential point 3 price") pass through
      // untouched — collectNumberedPoints() gathers them later. Checked
      // first so the looser branches below can't swallow them; the price
      // ones especially, since "price" otherwise reads as a deal value.
      if (/^(painpoint|essentialpoint|upsellpoint)\d+(price)?$/.test(key)) {
        canonical = key;
      } else if (key.includes('upsold') || key.includes('upsell')) {
        canonical = 'upsellfreeform';
      } else if (key.includes('essential')) {
        canonical = 'needfreeform';
      } else if (key.includes('mockup') && key.includes('email')) {
        // Checked ahead of both the cold-email and the plain "mockup"
        // branches: "personalised mockup email" is neither a second cold
        // email nor a link to a mockup, and either mistake loses it.
        canonical = 'mockupemail';
      } else if (key.includes('coldemail') || ((key.includes('personalized') || key.includes('personalised')) && key.includes('email'))) {
        canonical = 'personalisedcoldemail';
      } else if (key.includes('observation')) {
        canonical = 'personalizedobservation';
      } else if (key.includes('email')) {
        canonical = 'email';
      } else if (key.includes('invoice')) {
        canonical = 'invoicepdfurl';
      } else if (key.includes('password')) {
        canonical = 'vercelpassword';
      } else if (key.includes('value') || key.includes('price') || key.includes('budget')) {
        canonical = 'estimatedvalue';
      } else if (key.includes('mockup') && key.includes('pdf')) {
        canonical = 'mockuppdfurl';
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
 * (semicolon-separated keys), notes, status. Also accepts a wide set of
 * optional research columns produced by external prep work —
 * personalisedcoldemail (a full "Subject: ...\n\n<body>" draft, stored as-is
 * for one-click sending), mockupemail (the same thing again for the email
 * that carries the mockup, so the second email sounds like the first),
 * personalizedobservation (a short one-liner that
 * pre-fills the cold-outreach template), mockupurl and mockuppdfurl (the
 * finished mockup as a link and as a PDF), vercelpassword (the preview
 * deployment's password), invoicepdfurl, the business profile (industry,
 * address/city/region/postalcode/country, contactrole, company size,
 * employees, locations, revenue, Google rating and review count, socials),
 * tags, donotcontact, leadscore, assignedto (a team member's email),
 * dateadded/timeadded and clienttakenon (DDMMYYYY), originalwebsite,
 * salesnote and currentwebsite (a written assessment of the site they have).
 *
 * It also accepts the hand-written sales brief columns: "Pain point 1..N",
 * "Essential point 1..N" and "Upsell point 1..N" — no cap on N — each cell
 * written as "Point: explanation for this specific business", optionally
 * with a price inline ("| $900") or in a matching "Pain point 1 price"
 * column, plus the freeform equivalents ("Things they need", "Things they
 * could be upsold on") and the quotable range ("Lowest estimate", "Highest
 * estimate", or a single "Range" column).
 *
 * Every point is priced as it's imported: from the CSV where a price was
 * given, otherwise from the sales playbook, otherwise from a suggestion
 * scaled to the size of the business and flagged "custom" so it's obvious
 * the figure still needs agreeing. That way a rep never opens a line item
 * with no number beside it.
 *
 * Header matching is tolerant of real-world spelling/spacing — see
 * normalizeRow() — since research CSVs rarely use our exact field names.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { rows, fileName } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Max ${MAX_ROWS} rows per import` }, { status: 400 });
    }

    // Fetched once for the whole file rather than per row — a 1,000-row import
    // would otherwise run 1,000 identical queries to price the same catalogue.
    const [playbookRows, teamMembers] = await Promise.all([
      prisma.salesPlaybookItem.findMany(),
      prisma.user.findMany({ select: { id: true, email: true, name: true } }),
    ]);
    const playbook = new Map<string, PlaybookEntry>(playbookRows.map((r) => [r.slug, r]));
    const usersByEmail = new Map(teamMembers.map((u) => [u.email.toLowerCase(), u.id]));

    let skipped = 0;
    // Custom line items across the whole file — reported back so whoever ran
    // the import knows immediately which figures are ours to decide, rather
    // than finding out one lead at a time on a call.
    const customPoints: Array<{ company: string; point: string; priceCents: number }> = [];

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

        const annualRevenueCents = parseMoneyCents(row.annualrevenue);
        const employeeCount = parseIntOrNull(row.employeecount);
        const locationCount = parseIntOrNull(row.locationcount);

        // Sized before the points are priced, because the suggestion for any
        // line item we don't have a catalogue price for is scaled from it.
        const size = sizeCompany({
          companySize: row.companysize,
          employeeCount,
          locationCount,
          annualRevenueCents,
          estimatedValue,
          estimateHighCents,
        });

        const price = (points: SalesPoint[], kind: 'essential' | 'upsell' | 'pain') => {
          const resolved = resolvePointPrices(points, kind, playbook, size);
          for (const p of resolved) {
            if (p.isCustom && p.priceCents) {
              customPoints.push({ company, point: p.point, priceCents: p.priceCents });
            }
          }
          return formatSalesPoints(resolved);
        };

        const customPainPoints = price(collectNumberedPoints(row, 'painpoint'), 'pain');
        const essentialPoints = price(
          collectNumberedPoints(row, 'essentialpoint', 'needfreeform'),
          'essential'
        );
        const upsellPoints = price(
          collectNumberedPoints(row, 'upsellpoint', 'upsellfreeform'),
          'upsell'
        );

        // "Current website" carries a URL in some sheets and a written
        // assessment of the existing site in others. Route it by shape rather
        // than forcing whoever builds the CSV to remember which we wanted.
        const currentWebsiteRaw = row.currentwebsite?.trim() || '';
        const currentWebsiteIsUrl = /^(https?:\/\/|www\.)/i.test(currentWebsiteRaw);
        const originalWebsite = row.originalwebsite?.trim() || (currentWebsiteIsUrl ? currentWebsiteRaw : null);
        const currentSiteAssessment = !currentWebsiteIsUrl && currentWebsiteRaw ? currentWebsiteRaw : null;

        const status = isLeadStatus(row.status?.trim()) ? row.status.trim() : undefined;

        // Only the columns with genuinely nowhere else to go still get folded
        // into notes. Industry and address have real columns now.
        const extra = row.servicestopitch ? `Services to pitch: ${row.servicestopitch.trim()}` : '';
        const notes = [row.notes?.trim(), extra].filter(Boolean).join('\n\n') || null;

        const addedAt = parseDdmmyyyy(row.dateadded, row.timeadded);
        const clientTakenOnAt = parseDdmmyyyy(row.clienttakenon);
        const nextFollowUpAt = parseDdmmyyyy(row.nextfollowup);

        const assignedToId =
          (row.assignedto && usersByEmail.get(row.assignedto.trim().toLowerCase())) || session.userId;

        // A link in the sheet is version one of that lead's mockups, not just
        // a loose column — otherwise an imported lead shows "no mockups yet"
        // beside a mockup it demonstrably has.
        //
        // A PDF export is another version of the same mockup, so it joins the
        // same list rather than getting a column to itself: one place to look,
        // and the history survives the next revision. `fileName` is what marks
        // it as something to download rather than a link to open.
        const mockupUrl = normalizeMockupUrl(row.mockupurl);
        const mockupPdfUrl = normalizeMockupUrl(row.mockuppdfurl);
        const mockupRows = [
          ...(mockupUrl ? [{ url: mockupUrl, uploadedById: session.userId }] : []),
          ...(mockupPdfUrl
            ? [
                {
                  url: mockupPdfUrl,
                  fileName: `${company} mockup.pdf`,
                  uploadedById: session.userId,
                },
              ]
            : []),
        ];
        const mockups = mockupRows.length > 0 ? { create: mockupRows } : undefined;
        // The cached column prefers the live link, since that's what the email
        // composer offers as a default and a PDF is a poor thing to send as
        // "here's your mockup". It only falls back to the PDF when that's all
        // this lead has.
        const latestMockupUrl = mockupUrl ?? mockupPdfUrl;

        return {
          company,
          contactName: row.contactname || null,
          contactRole: row.contactrole?.trim() || null,
          email: row.email?.includes('@') ? row.email.trim() : null,
          phone: row.phone || null,
          altPhone: row.altphone?.trim() || null,
          source: row.source || null,
          estimatedValue,
          painPoints,
          notes,
          status,
          coldEmailDraft: row.personalisedcoldemail?.trim() || null,
          mockupEmailDraft: row.mockupemail?.trim() || null,
          personalizedObservation:
            row.personalizedobservation?.trim() || row.personalisedobservation?.trim() || null,

          // Deliverables
          mockupUrl: latestMockupUrl,
          mockupDeliveredAt: latestMockupUrl ? new Date() : null,
          mockups,
          vercelDeployPassword: row.vercelpassword?.trim() || null,
          invoicePdfUrl: row.invoicepdfurl?.trim() || null,
          invoicePdfUploadedAt: row.invoicepdfurl?.trim() ? new Date() : null,

          // Business profile
          industry: row.industry?.trim() || null,
          address: row.address?.trim() || null,
          city: row.city?.trim() || null,
          region: row.region?.trim() || null,
          postalCode: row.postalcode?.trim() || null,
          country: row.country?.trim() || null,
          timezone: row.timezone?.trim() || null,
          // Only recorded when something in the sheet actually said so — a
          // band inferred from our own deal estimate is a pricing input, not
          // a fact about the business, and shouldn't read back as one.
          companySize: size.known ? size.band : null,
          employeeCount,
          locationCount,
          annualRevenueCents,
          yearFounded: parseIntOrNull(row.yearfounded),

          // Public presence
          googleRating: parseFloatOrNull(row.googlerating),
          googleReviewCount: parseIntOrNull(row.googlereviewcount),
          googleMapsUrl: row.googlemapsurl?.trim() || null,
          instagramUrl: row.instagramurl?.trim() || null,
          facebookUrl: row.facebookurl?.trim() || null,
          linkedinUrl: row.linkedinurl?.trim() || null,

          tags: (row.tags || '')
            .split(/[;,]/)
            .map((t) => t.trim())
            .filter(Boolean)
            .join(','),
          doNotContact: parseBool(row.donotcontact),
          doNotContactReason: row.donotcontactreason?.trim() || null,
          leadScore: parseIntOrNull(row.leadscore),

          originalWebsite,
          currentSiteAssessment,
          salesNote: row.salesnote?.trim() || null,
          customPainPoints,
          essentialPoints,
          upsellPoints,
          estimateLowCents,
          estimateHighCents,

          // Dates. addedAt falls back to now, which is what the column
          // default would have done anyway; clientTakenOnAt stays null unless
          // the sheet says otherwise, since most imports are still prospects.
          ...(addedAt ? { addedAt } : {}),
          ...(clientTakenOnAt ? { clientTakenOnAt } : {}),
          ...(nextFollowUpAt ? { nextFollowUpAt } : {}),

          assignedToId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    // Two research CSVs overlapping is normal, and nothing stopped the same
    // business being created twice — which ends with a rep ringing someone who
    // was called yesterday. Match on email where there is one (exact, and the
    // strongest signal), otherwise on the company name reduced to letters and
    // digits so "A1 Duran Roofing" and "A1 Duran Roofing, Inc." don't slip
    // past each other on punctuation alone.
    const companyKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existing = await prisma.lead.findMany({
      select: { email: true, company: true },
    });
    const seenEmails = new Set(
      existing.map((l) => l.email?.toLowerCase()).filter((e): e is string => !!e)
    );
    const seenCompanies = new Set(existing.map((l) => companyKey(l.company)));

    let duplicates = 0;
    const duplicateNames: string[] = [];
    const deduped = toCreate.filter((row) => {
      const email = row.email?.toLowerCase();
      const key = companyKey(row.company);
      const isDup = email ? seenEmails.has(email) : seenCompanies.has(key);
      if (isDup) {
        duplicates++;
        if (duplicateNames.length < 5) duplicateNames.push(row.company);
        return false;
      }
      // Guard against the same row appearing twice within this one file too.
      if (email) seenEmails.add(email);
      seenCompanies.add(key);
      return true;
    });

    if (deduped.length === 0 && duplicates > 0) {
      return NextResponse.json(
        {
          error: `Every row is already in your leads — nothing new to add. (${duplicates} duplicate${duplicates === 1 ? '' : 's'})`,
          duplicates,
          duplicateNames,
        },
        { status: 400 }
      );
    }

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

    const created = await prisma.$transaction(deduped.map((data) => prisma.lead.create({ data })));

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

    // Only the custom points belonging to leads that actually landed — a
    // duplicate row's line items aren't anybody's decision to make.
    const importedCompanies = new Set(created.map((l) => l.company));
    const customToReview = customPoints.filter((c) => importedCompanies.has(c.company));

    return NextResponse.json(
      {
        success: true,
        count: created.length,
        skipped,
        duplicates,
        duplicateNames,
        customPoints: customToReview.slice(0, 50),
        customPointCount: customToReview.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Lead CSV import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
