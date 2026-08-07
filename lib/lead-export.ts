import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';

/**
 * The lead book as a CSV.
 *
 * Lived inside the spreadsheet component, which lived at the bottom of the
 * dashboard behind no nav item — so the one way to get the data out of this
 * system was through a screen nobody could find. Pulled out here so it can
 * belong to the lead list instead, and so the escaping can be tested rather
 * than assumed: a company name with a comma in it is not exotic, and a CSV
 * that breaks on one silently shifts every column after it.
 */

/** Anything the export can read. Everything past `company` is optional. */
export interface ExportableLead {
  company: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  estimatedValue?: number | null;
  estimateLowCents?: number | null;
  estimateHighCents?: number | null;
  source?: string | null;
  industry?: string | null;
  city?: string | null;
  region?: string | null;
  companySize?: string | null;
  employeeCount?: number | null;
  tags?: string | null;
  doNotContact?: boolean | null;
  mockupUrl?: string | null;
  invoicePdfUrl?: string | null;
  assignedTo?: { name: string | null } | null;
  addedAt?: string | null;
  clientTakenOnAt?: string | null;
  updatedAt?: string | null;
}

export const LEAD_CSV_HEADERS = [
  'Company',
  'Contact',
  'Email',
  'Phone',
  'Status',
  'Value',
  'Lowest estimate',
  'Highest estimate',
  'Source',
  'Industry',
  'City',
  'State',
  'Company size',
  'Employees',
  'Tags',
  'Do not contact',
  'Mockup URL',
  'Invoice PDF URL',
  'Assigned',
  'Date added',
  'Client taken on',
  'Updated',
] as const;

/**
 * Quotes a field only when it has to be quoted.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a quote as well. Spreadsheet
 * software treats those as the start of a formula, so a company that has
 * called itself "=Sum Digital" becomes a live cell in someone else's
 * spreadsheet — that is CSV injection, and the file leaves this building.
 */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** DDMMYYYY — the same format the date filters accept, so an export re-imports. */
export function ddmmyyyy(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}${pad(date.getUTCMonth() + 1)}${date.getUTCFullYear()}`;
}

const money = (cents: number | null | undefined) =>
  typeof cents === 'number' && cents > 0 ? (cents / 100).toFixed(2) : '';

export function leadCsv(leads: ExportableLead[]): string {
  const rows = leads.map((l) => [
    l.company,
    l.contactName || '',
    l.email || '',
    l.phone || '',
    l.status ? LEAD_STATUS_LABELS[l.status as LeadStatus] || l.status : '',
    money(l.estimatedValue),
    money(l.estimateLowCents),
    money(l.estimateHighCents),
    l.source || '',
    l.industry || '',
    l.city || '',
    l.region || '',
    l.companySize || '',
    l.employeeCount ?? '',
    l.tags || '',
    l.doNotContact ? 'yes' : '',
    l.mockupUrl || '',
    l.invoicePdfUrl || '',
    l.assignedTo?.name || '',
    ddmmyyyy(l.addedAt),
    ddmmyyyy(l.clientTakenOnAt),
    ddmmyyyy(l.updatedAt),
  ]);

  return [LEAD_CSV_HEADERS, ...rows]
    .map((row) => row.map((cell) => csvCell(String(cell))).join(','))
    .join('\n');
}

/**
 * The columns `leadCsv` reads, as a Prisma `select` fragment.
 *
 * Here rather than in the route because this is the export's business, and
 * because the two lists drifting apart is not a failure anything notices: the
 * button still works, the file still downloads, the headers are all still
 * there with nothing underneath them. That is exactly what happened when the
 * leads endpoint was narrowed to the fields the board and the table *render*
 * — thirteen of these twenty-two columns went blank, and the only way to find
 * out was to need one of them.
 *
 * Spread it into the query instead of restating it. Adding a column to
 * LEAD_CSV_HEADERS and to `leadCsv` is then one more line here, in the same
 * file, rather than a change in a route nobody editing an export would think
 * to open.
 *
 * `assignedTo` is not in here: it is a relation, and the route already joins
 * it for the screens.
 */
export const LEAD_EXPORT_SELECT = {
  company: true,
  contactName: true,
  email: true,
  phone: true,
  status: true,
  estimatedValue: true,
  estimateLowCents: true,
  estimateHighCents: true,
  source: true,
  industry: true,
  city: true,
  region: true,
  companySize: true,
  employeeCount: true,
  tags: true,
  doNotContact: true,
  mockupUrl: true,
  invoicePdfUrl: true,
  addedAt: true,
  clientTakenOnAt: true,
  updatedAt: true,
} as const;

/** `bothmade-leads-2026-08-05.csv` */
export function leadCsvFilename(now: Date = new Date()): string {
  return `bothmade-leads-${now.toISOString().slice(0, 10)}.csv`;
}
