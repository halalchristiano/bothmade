import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { LOGO_BACKGROUND, LOGO_HEIGHT, LOGO_WIDTH, logoJpegBytes } from '@/lib/brand-logo';
import { COMPANY_ADDRESS_LINES, COMPANY_EMAIL, COMPANY_NAME } from '@/lib/company';
import { winAnsi } from '@/lib/pdf-text';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  customItemsTotal,
  depositAmount,
  formatCents,
  formatCentsExact,
  isIncludedInBase,
  type AddOnKey,
  type BaseService,
  type ClientType,
  type CustomItem,
  type TimelineKey,
} from '@/lib/pricing';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLACK = rgb(0.08, 0.08, 0.1);
const GRAY = rgb(0.42, 0.42, 0.46);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.87);
const ACCENT = rgb(0.13, 0.55, 0.85);
const WHITE = rgb(1, 1, 1);
const BRAND_FIELD = rgb(LOGO_BACKGROUND.r, LOGO_BACKGROUND.g, LOGO_BACKGROUND.b);
const BAND_HEIGHT = 66;

export interface InvoiceLineItem {
  label: string;
  /** Formatted, e.g. "$3,000" or "Included" — kept as a string so the
   * caller controls presentation (currency formatting, "$0" vs "Included"). */
  amount: string;
}

export interface InvoicePdfInput {
  invoiceNumber: string;
  date: string;
  company: string;
  contactName: string | null;
  lineItems: InvoiceLineItem[];
  adjustments: InvoiceLineItem[];
  subtotal: string;
  total: string;
  /** What this invoice is actually asking to be paid right now — the full
   * total, or a deposit against it. */
  amountDue: string;
  isDeposit: boolean;
  balanceRemaining?: string;
  /** Line under the invoice number, e.g. the billing period on a monthly one. */
  subheading?: string;
  /** One line above the table saying what the invoice is for, when the line items alone don't. */
  summary?: string;
  /** Overrides "Amount due" — a receipt for money already taken says "paid". */
  amountDueLabel?: string;
  /** Replaces the closing note, which otherwise cites a project agreement. */
  footerNote?: string;
}

/** Greedy word-wrap against the actual measured width of the given font/size. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * A one-page itemized invoice, generated fresh for every sign-and-pay send.
 * Exists because the bank's own payment confirmation has no line-item
 * breakdown — this is the document that actually shows what was charged for.
 */
export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Every string drawn below goes through winAnsi() first — a client name
  // the standard fonts can't encode would otherwise throw, and every caller
  // of this builder catches and logs, so the failure is invisible. See
  // lib/pdf-text.ts.
  const drawText = (
    raw: string,
    x: number,
    opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}
  ) => {
    const { size = 11, f = font, color = BLACK } = opts;
    page.drawText(winAnsi(raw), { x, y, size, font: f, color });
  };

  /** Same as drawText, but measured so the text ends at the right margin. */
  const drawTextRight = (
    raw: string,
    opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; at?: number } = {}
  ) => {
    const { size = 11, f = font, color = BLACK, at = y } = opts;
    const text = winAnsi(raw);
    page.drawText(text, { x: PAGE_WIDTH - MARGIN - f.widthOfTextAtSize(text, size), y: at, size, font: f, color });
  };

  const drawRow = (label: string, rawAmount: string, opts: { f?: PDFFont; color?: ReturnType<typeof rgb>; size?: number } = {}) => {
    const { f = font, color = BLACK, size = 11 } = opts;
    const amount = winAnsi(rawAmount);
    const wrapped = wrapText(winAnsi(label), f, size, CONTENT_WIDTH - 140);
    page.drawText(wrapped[0] ?? '', { x: MARGIN, y, size, font: f, color });
    const amountWidth = f.widthOfTextAtSize(amount, size);
    page.drawText(amount, { x: PAGE_WIDTH - MARGIN - amountWidth, y, size, font: f, color });
    y -= 16;
    for (const extra of wrapped.slice(1)) {
      page.drawText(extra, { x: MARGIN, y, size, font: f, color: GRAY });
      y -= 14;
    }
  };

  const hr = (color = LIGHT_GRAY) => {
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color });
    y -= 16;
  };

  // Header band — the wordmark carries its own near-black field, so the band
  // is drawn in the same colour and the mark sits in it without a seam.
  const logo = await doc.embedJpg(logoJpegBytes());
  const logoWidth = 140;
  const logoHeight = (logoWidth * LOGO_HEIGHT) / LOGO_WIDTH;
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - BAND_HEIGHT,
    width: PAGE_WIDTH,
    height: BAND_HEIGHT,
    color: BRAND_FIELD,
  });
  page.drawImage(logo, {
    x: MARGIN,
    y: PAGE_HEIGHT - BAND_HEIGHT / 2 - logoHeight / 2,
    width: logoWidth,
    height: logoHeight,
  });
  y = PAGE_HEIGHT - BAND_HEIGHT / 2 - 6;
  drawTextRight('INVOICE', { size: 16, f: bold, color: WHITE });

  y = PAGE_HEIGHT - BAND_HEIGHT - 28;
  drawText(`Invoice #${input.invoiceNumber}`, MARGIN, { size: 10, color: GRAY });
  drawTextRight(input.date, { size: 10, color: GRAY });
  y -= 30;

  if (input.subheading) {
    drawText(input.subheading, MARGIN, { size: 10, color: GRAY });
    y -= 22;
  }

  // Who it's from and who it's for, side by side — an invoice has to carry the
  // issuing address, not just the billing one.
  const columnTop = y;
  drawText('From', MARGIN, { size: 9, f: bold, color: GRAY });
  y -= 15;
  drawText(COMPANY_NAME, MARGIN, { size: 11, f: bold });
  y -= 14;
  for (const line of COMPANY_ADDRESS_LINES) {
    drawText(line, MARGIN, { size: 10, color: GRAY });
    y -= 13;
  }
  drawText(COMPANY_EMAIL, MARGIN, { size: 10, color: GRAY });
  y -= 13;
  const fromBottom = y;

  // Half the width, less a gutter — a long client name wraps rather than
  // running back across the address in the column beside it.
  const billToWidth = CONTENT_WIDTH / 2 - 16;

  y = columnTop;
  drawTextRight('Bill to', { size: 9, f: bold, color: GRAY });
  y -= 15;
  for (const line of wrapText(input.company, bold, 12, billToWidth)) {
    drawTextRight(line, { size: 12, f: bold });
    y -= 16;
  }
  if (input.contactName) {
    for (const line of wrapText(input.contactName, font, 11, billToWidth)) {
      drawTextRight(line, { size: 11, color: GRAY });
      y -= 16;
    }
  }

  y = Math.min(fromBottom, y) - 14;

  if (input.summary) {
    drawText('For', MARGIN, { size: 9, f: bold, color: GRAY });
    y -= 15;
    for (const line of wrapText(input.summary, font, 11, CONTENT_WIDTH)) {
      drawText(line, MARGIN, { size: 11 });
      y -= 15;
    }
    y -= 8;
  }

  // Line items
  drawText('Description', MARGIN, { size: 9, f: bold, color: GRAY });
  drawText('Amount', PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize('Amount', 9), { size: 9, f: bold, color: GRAY });
  y -= 14;
  hr();

  for (const item of input.lineItems) {
    drawRow(item.label, item.amount);
  }

  if (input.adjustments.length > 0) {
    hr();
    for (const item of input.adjustments) {
      drawRow(item.label, item.amount, { color: GRAY });
    }
  }

  hr();
  drawRow('Subtotal', input.subtotal, { color: GRAY });
  y -= 4;
  drawRow('Total', input.total, { f: bold, size: 14 });
  y -= 10;

  if (input.isDeposit) {
    hr();
    drawRow('Due now (deposit)', input.amountDue, { f: bold, size: 13, color: ACCENT });
    if (input.balanceRemaining) {
      drawRow('Balance due on completion', input.balanceRemaining, { color: GRAY });
    }
  } else {
    hr();
    drawRow(input.amountDueLabel || 'Amount due', input.amountDue, { f: bold, size: 13, color: ACCENT });
  }

  y -= 30;
  const footer = wrapText(
    input.footerNote ||
      'This invoice reflects the scope agreed in the accompanying project agreement. Payment is processed securely by Stripe.',
    font,
    9,
    CONTENT_WIDTH
  );
  for (const line of footer) {
    page.drawText(line, { x: MARGIN, y, size: 9, font, color: GRAY });
    y -= 12;
  }

  return doc.save();
}

/**
 * A line on a one-off charge. Structurally what a CustomItem already is, so a
 * sanitized CustomItem[] passes straight in — but not the same type on
 * purpose: a CustomItem carries a written scope because a *contract* has to
 * spell out what bespoke work covers, and a charge for an agreed extra states
 * that once, in the invoice's own description. Reusing the type would drag
 * that requirement somewhere it doesn't belong.
 */
export interface ChargeLine {
  label: string;
  priceCents: number;
}

export interface CustomChargeInvoiceInput {
  invoiceNumber: string;
  company: string;
  contactName: string | null;
  /** What the charge is for — printed under the number, above the lines. */
  description: string;
  lineItems: ChargeLine[];
  issuedAt?: Date;
}

/**
 * The invoice for a one-off charge: an amount someone on the team typed in,
 * for work that never came out of the catalogue.
 *
 * Same document as the proposal invoice — deliberately, since a client
 * should not be able to tell from the paperwork whether what they were billed
 * for was priced by a calculator or by a person. The only difference is that
 * there is nothing to discount, uplift, or split into a deposit: the lines
 * are the total and the total is due.
 */
export async function buildCustomChargeInvoicePdf(input: CustomChargeInvoiceInput): Promise<Uint8Array> {
  const total = input.lineItems.reduce((sum, item) => sum + item.priceCents, 0);
  const issuedAt = input.issuedAt ?? new Date();

  return buildInvoicePdf({
    invoiceNumber: input.invoiceNumber,
    date: issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    company: input.company,
    contactName: input.contactName,
    summary: input.description,
    // formatCentsExact, not formatCents: a custom charge can carry cents, and
    // an invoice that rounds them is a discrepancy against the card charge.
    lineItems: input.lineItems.map((item) => ({ label: item.label, amount: formatCentsExact(item.priceCents) })),
    adjustments: [],
    subtotal: formatCentsExact(total),
    total: formatCentsExact(total),
    amountDue: formatCentsExact(total),
    isDeposit: false,
    footerNote:
      'This invoice covers work agreed with Bothmade outside the original project scope. Payment is processed securely by Stripe.',
  });
}

export interface CarePlanInvoiceInput {
  /** Stripe's own invoice number when it has one, so the client's copy and
   * the Stripe dashboard agree on which month is which. */
  invoiceNumber: string;
  company: string;
  contactName: string | null;
  addOnKeys: AddOnKey[];
  /** The standard rate, before the introductory discount. */
  standardCents: number;
  /** What was actually charged. */
  chargedCents: number;
  /** "August 4 – September 4, 2026", or null when Stripe didn't send a period. */
  periodLabel: string | null;
  /** How the discount is described on the invoice, e.g. "First-year rate (15% off)". */
  discountLabel: string | null;
  date: string;
}

/**
 * The monthly invoice for an active care plan.
 *
 * Sent because the card statement says "BOTHMADE" and nothing else — the
 * client needs a document that names what the charge was for, which months it
 * covered, and what the introductory rate saved them, both to file it and to
 * see the discount is still being applied.
 */
export async function buildCarePlanInvoicePdf(input: CarePlanInvoiceInput): Promise<Uint8Array> {
  const discount = input.standardCents - input.chargedCents;

  return buildInvoicePdf({
    invoiceNumber: input.invoiceNumber,
    date: input.date,
    subheading: input.periodLabel ? `Service period: ${input.periodLabel}` : undefined,
    company: input.company,
    contactName: input.contactName,
    lineItems: input.addOnKeys.map((key) => ({
      label: `${ADD_ONS[key].label} — monthly`,
      amount: formatCents(ADD_ONS[key].price),
    })),
    adjustments:
      discount > 0 && input.discountLabel
        ? [{ label: input.discountLabel, amount: `-${formatCents(discount)}` }]
        : [],
    subtotal: formatCents(input.standardCents),
    total: formatCents(input.chargedCents),
    amountDue: formatCents(input.chargedCents),
    amountDueLabel: 'Paid',
    isDeposit: false,
    footerNote:
      'This is a recurring monthly charge for your care plan. Payment is processed securely by Stripe, and you can cancel at any time by replying to this email.',
  });
}

export interface InvoiceForProposalInput {
  leadId: string;
  company: string;
  contactName: string | null;
  baseService: BaseService;
  addOnKeys: AddOnKey[];
  clientType: ClientType;
  timeline: TimelineKey;
  customItems: CustomItem[];
  totalPrice: number; // cents — the persisted/negotiated total, may differ from the calculated one
  depositOnly: boolean;
}

/**
 * Builds the invoice for a lead's current proposal selection — shared by the
 * sign-and-pay send, a standalone re-send, and a self-copy, so all three
 * always show identical numbers for the same underlying proposal.
 */
export async function buildInvoiceForProposal(input: InvoiceForProposalInput): Promise<Uint8Array> {
  const { leadId, company, contactName, baseService, addOnKeys, clientType, timeline, customItems, totalPrice, depositOnly } =
    input;

  const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
  const customTotal = customItemsTotal(customItems);
  const calculatedTotal = breakdown.totalPrice + customTotal;
  const chargeAmount = depositOnly ? depositAmount(totalPrice) : totalPrice;

  const lineItems = [
    { label: BASE_SERVICES[baseService].label, amount: formatCents(breakdown.basePrice) },
    ...addOnKeys.map((key) => ({
      label: ADD_ONS[key].label,
      amount: isIncludedInBase(baseService, key) ? 'Included' : formatCents(ADD_ONS[key].price),
    })),
    ...customItems.map((item) => ({ label: item.label, amount: formatCents(item.priceCents) })),
  ];

  const adjustments: InvoiceLineItem[] = [];
  if (breakdown.clientTypeMultiplier !== 1) {
    adjustments.push({
      label: `${CLIENT_TYPES[clientType].label} adjustment (${Math.round((breakdown.clientTypeMultiplier - 1) * 100)}%)`,
      amount: formatCents(Math.round(breakdown.subtotal * breakdown.clientTypeMultiplier) - breakdown.subtotal),
    });
  }
  if (breakdown.timelineMultiplier !== 1) {
    adjustments.push({
      label: `${TIMELINES[timeline].label} timeline (${Math.round((breakdown.timelineMultiplier - 1) * 100)}%)`,
      amount: formatCents(breakdown.totalPrice - Math.round(breakdown.subtotal * breakdown.clientTypeMultiplier)),
    });
  }
  if (totalPrice !== calculatedTotal) {
    adjustments.push({
      label: 'Negotiated adjustment',
      amount: formatCents(totalPrice - calculatedTotal),
    });
  }

  return buildInvoicePdf({
    invoiceNumber: leadId.slice(0, 8).toUpperCase(),
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    company,
    contactName,
    lineItems,
    adjustments,
    subtotal: formatCents(breakdown.subtotal + customTotal),
    total: formatCents(totalPrice),
    amountDue: formatCents(chargeAmount),
    isDeposit: depositOnly,
    balanceRemaining: depositOnly ? formatCents(totalPrice - chargeAmount) : undefined,
  });
}


export interface InstalmentInvoiceInput {
  invoiceNumber: string;
  date: string;
  company: string;
  contactName: string | null;
  projectName: string;
  /** The full three-row schedule, in order, with live statuses. */
  schedule: Array<{
    label: string;
    amount: string;
    status: 'paid' | 'due' | 'scheduled';
    triggerLabel: string;
  }>;
  /** Which row this invoice bills, 1-based. */
  instalmentIndex: number;
  amountDue: string;
  totalPrice: string;
  dueDate: string;
  /** One sentence of gate context: "Due on Design Approval — approved August 4, 2026." */
  gateLine: string;
}

// The purple half of the wordmark gradient, print-strength. Paired with
// ACCENT (sky) as a two-segment rule under headings — the closest a printed
// page gets to the site's sky-to-purple sweep without dithering a gradient.
const ACCENT_PURPLE = rgb(0.55, 0.36, 0.96);

/**
 * The instalment invoice: one of exactly three per project, and it says so.
 *
 * The design goal is that a client holding this page can answer, without
 * reading a single paragraph: which payment this is, what it costs, why it
 * fell due now, and where they stand across the whole schedule. Hence the
 * oversized "PAYMENT 2 OF 3", the gate line under it, and the full schedule
 * table with the current row picked out — an invoice that shows its own
 * past and future is one nobody has to reconcile against an email thread.
 */
export async function buildInstalmentInvoicePdf(input: InstalmentInvoiceInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const text = (raw: string, x: number, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; at?: number } = {}) => {
    const { size = 11, f = font, color = BLACK, at = y } = opts;
    page.drawText(winAnsi(raw), { x, y: at, size, font: f, color });
  };
  const textRight = (raw: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; at?: number } = {}) => {
    const { size = 11, f = font, color = BLACK, at = y } = opts;
    const t = winAnsi(raw);
    page.drawText(t, { x: PAGE_WIDTH - MARGIN - f.widthOfTextAtSize(t, size), y: at, size, font: f, color });
  };
  /** The sky-then-purple rule that stands in for the brand gradient. */
  const brandRule = (atY: number, width = CONTENT_WIDTH) => {
    page.drawLine({ start: { x: MARGIN, y: atY }, end: { x: MARGIN + width * 0.55, y: atY }, thickness: 2, color: ACCENT });
    page.drawLine({ start: { x: MARGIN + width * 0.55, y: atY }, end: { x: MARGIN + width, y: atY }, thickness: 2, color: ACCENT_PURPLE });
  };

  // Brand band with the wordmark on its own field.
  const logo = await doc.embedJpg(logoJpegBytes());
  const logoWidth = 140;
  const logoHeight = (logoWidth * LOGO_HEIGHT) / LOGO_WIDTH;
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - BAND_HEIGHT, width: PAGE_WIDTH, height: BAND_HEIGHT, color: BRAND_FIELD });
  page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - BAND_HEIGHT / 2 - logoHeight / 2, width: logoWidth, height: logoHeight });
  textRight('INVOICE', { size: 16, f: bold, color: WHITE, at: PAGE_HEIGHT - BAND_HEIGHT / 2 - 6 });

  // The headline is the instalment position, not the word "invoice" — that
  // is the one fact the whole payment structure hangs on.
  y = PAGE_HEIGHT - BAND_HEIGHT - 54;
  const row = input.schedule[input.instalmentIndex - 1];
  text((row?.label ?? 'Payment').toUpperCase(), MARGIN, { size: 26, f: bold });
  textRight(input.amountDue, { size: 26, f: bold, color: ACCENT });
  y -= 12;
  brandRule(y);
  y -= 18;
  text(input.gateLine, MARGIN, { size: 10.5, color: GRAY });
  y -= 26;

  text(`Invoice ${input.invoiceNumber}`, MARGIN, { size: 10, color: GRAY });
  textRight(`Issued ${input.date}  ·  Due ${input.dueDate}`, { size: 10, color: GRAY });
  y -= 28;

  // From / For columns.
  const colTop = y;
  text('From', MARGIN, { size: 9, f: bold, color: GRAY });
  y -= 15;
  text(COMPANY_NAME, MARGIN, { size: 11, f: bold });
  y -= 14;
  for (const line of COMPANY_ADDRESS_LINES) {
    text(line, MARGIN, { size: 10, color: GRAY });
    y -= 13;
  }
  text(COMPANY_EMAIL, MARGIN, { size: 10, color: GRAY });
  const leftBottom = y;
  y = colTop;
  const col2 = MARGIN + CONTENT_WIDTH / 2;
  text('For', col2, { size: 9, f: bold, color: GRAY });
  y -= 15;
  text(input.company, col2, { size: 11, f: bold });
  y -= 14;
  if (input.contactName) {
    text(input.contactName, col2, { size: 10, color: GRAY });
    y -= 13;
  }
  text(input.projectName, col2, { size: 10, color: GRAY });
  y = Math.min(leftBottom, y) - 30;

  // The schedule table: all three payments with live status, current row on
  // a tinted band. Three rows, fixed height — no pagination risk.
  text('PAYMENT SCHEDULE', MARGIN, { size: 9, f: bold, color: GRAY });
  textRight(`Project total ${input.totalPrice}`, { size: 9, f: bold, color: GRAY });
  y -= 10;
  const ROW_H = 34;
  for (const inst of input.schedule) {
    const isCurrent = inst === row;
    if (isCurrent) {
      page.drawRectangle({ x: MARGIN - 8, y: y - ROW_H + 10, width: CONTENT_WIDTH + 16, height: ROW_H, color: rgb(0.93, 0.97, 1) });
      page.drawRectangle({ x: MARGIN - 8, y: y - ROW_H + 10, width: 3, height: ROW_H, color: ACCENT });
    }
    y -= 14;
    text(inst.label, MARGIN, { size: 11, f: isCurrent ? bold : font });
    const statusLabel = inst.status === 'paid' ? 'PAID' : inst.status === 'due' ? 'DUE NOW' : 'UPCOMING';
    const statusColor = inst.status === 'paid' ? rgb(0.09, 0.55, 0.35) : inst.status === 'due' ? ACCENT : GRAY;
    text(statusLabel, MARGIN + 150, { size: 9, f: bold, color: statusColor });
    text(inst.triggerLabel, MARGIN + 230, { size: 9, color: GRAY });
    textRight(inst.amount, { size: 11, f: isCurrent ? bold : font });
    y -= ROW_H - 14;
  }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LIGHT_GRAY });
  y -= 24;

  // Amount-due block.
  text('Amount due', MARGIN, { size: 12, f: bold });
  textRight(input.amountDue, { size: 18, f: bold, color: ACCENT });
  y -= 18;
  text(`Payable within 14 days, by ${input.dueDate}.`, MARGIN, { size: 10, color: GRAY });
  y -= 34;

  const note =
    input.instalmentIndex >= input.schedule.length
      ? 'This is the final payment on your project. Once it clears, your site goes live and all files, credentials, and intellectual property transfer to you in full, as set out in your agreement.'
      : 'Per your agreement, work on the next phase begins once this payment is received. Payments are processed securely by Stripe; Bothmade never sees your card details.';
  for (const line of wrapText(note, font, 9.5, CONTENT_WIDTH)) {
    text(line, MARGIN, { size: 9.5, color: GRAY });
    y -= 13;
  }

  // Footer strip anchored to the page bottom, echoing the band.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: 36, color: BRAND_FIELD });
  page.drawText(winAnsi(`${COMPANY_NAME} — ${COMPANY_EMAIL}`), { x: MARGIN, y: 14, size: 8.5, font, color: rgb(0.75, 0.78, 0.85) });
  const fr = winAnsi(input.invoiceNumber);
  page.drawText(fr, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(fr, 8.5), y: 14, size: 8.5, font, color: rgb(0.75, 0.78, 0.85) });

  return doc.save();
}
