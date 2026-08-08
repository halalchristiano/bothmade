import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { LOGO_BACKGROUND, LOGO_HEIGHT, LOGO_WIDTH, logoJpegBytes } from '@/lib/brand-logo';
import { COMPANY_ADDRESS_LINES, COMPANY_EMAIL, COMPANY_NAME } from '@/lib/company';
import { winAnsi } from '@/lib/pdf-text';
import { invoiceDate } from '@/lib/money-dates';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  customItemsTotal,
  formatCents,
  formatCentsExact,
  instalmentSchedule,
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
  /** What this invoice is actually asking to be paid right now. */
  amountDue: string;
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

  hr();
  drawRow(input.amountDueLabel || 'Amount due', input.amountDue, { f: bold, size: 13, color: ACCENT });

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
  /**
   * When the money arrived, if it has.
   *
   * The stored PDF is the document a client's bookkeeper files, and it said
   * "Amount due: $1,200" forever — including on an invoice they had paid
   * weeks earlier, downloaded from their own dashboard, filed as an
   * outstanding bill. A care-plan invoice has always said "Paid"; this one
   * never learned how, because nothing regenerated it after the payment.
   */
  paidAt?: Date | null;

  /**
   * When it was cancelled, if it was.
   *
   * Same failure as `paidAt` above, running the other way. Voiding an invoice
   * puts a "Void" badge on both dashboards and leaves the stored PDF exactly
   * as it was — "Amount due: $2,500", on the document a client forwards to
   * their bookkeeper. The app knows the bill is cancelled; the piece of paper
   * that leaves the app does not.
   */
  voidedAt?: Date | null;
  /** Why, in the words the client was already given in the email. */
  voidReason?: string | null;

  /**
   * Money against it that has not settled it.
   *
   * The third state this document never learned. `paidAt` and `voidedAt`
   * were each added because the stored PDF is what a client's bookkeeper
   * files and it was contradicting their bank statement — and an invoice
   * part paid by transfer contradicts it just as squarely. It reads "Amount
   * due: $1,800" to somebody who sent $900 three weeks ago, which is the
   * document they will be holding when they ring up about it.
   *
   * Net of anything refunded, because that is what is actually still here.
   */
  receivedCents?: number;
  /** What has gone back, if any — named separately so the note can say so. */
  refundedCents?: number;
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
  // What is actually still here, and never more than the invoice — an
  // overpayment is a conversation, not a negative amount due.
  const received = Math.max(0, input.receivedCents ?? 0);
  const refunded = Math.max(0, input.refundedCents ?? 0);
  const held = Math.min(total, received);

  return buildInvoicePdf({
    invoiceNumber: input.invoiceNumber,
    date: invoiceDate(issuedAt),
    company: input.company,
    contactName: input.contactName,
    summary: input.description,
    // formatCentsExact, not formatCents: a custom charge can carry cents, and
    // an invoice that rounds them is a discrepancy against the card charge.
    lineItems: input.lineItems.map((item) => ({ label: item.label, amount: formatCentsExact(item.priceCents) })),
    adjustments: [],
    subtotal: formatCentsExact(total),
    total: formatCentsExact(total),
    // The figure, and what to call it.
    //
    // Cancelled first: an invoice that was voided is not owed whether or not
    // anything was ever paid against it, and "Amount due" on it is the worst
    // of the four things this line can say. Then settled — "Amount due" on a
    // paid invoice is a document that contradicts the client's own bank
    // statement, and theirs is the one their accountant believes.
    //
    // Then part paid, which contradicts it the same way and was reading the
    // full amount: what is due is what is LEFT, and the note below says where
    // the difference went so the two figures cannot be mistaken for a
    // discount or a mistake.
    amountDue: formatCentsExact(
      input.voidedAt || input.paidAt ? total : Math.max(0, total - held)
    ),
    amountDueLabel: input.voidedAt
      ? 'Cancelled'
      : input.paidAt
      ? 'Paid'
      : held > 0
      ? 'Still due'
      : undefined,
    footerNote: input.voidedAt
      ? `Cancelled on ${invoiceDate(input.voidedAt)} — there is nothing to pay.${
          input.voidReason ? ` ${input.voidReason}` : ''
        } This invoice has been withdrawn and replaces no other.`
      : input.paidAt
      ? `Paid in full on ${invoiceDate(input.paidAt)}. Thank you. This invoice covered work agreed with Bothmade outside the original project scope.`
      : held > 0 || refunded > 0
      ? `${[
          received > 0 ? `${formatCentsExact(received)} received against this invoice` : null,
          refunded > 0 ? `${formatCentsExact(refunded)} refunded` : null,
        ]
          .filter(Boolean)
          .join(', ')}. ${formatCentsExact(Math.max(0, total - held))} of the ${formatCentsExact(total)} remains due. This invoice covered work agreed with Bothmade outside the original project scope.`
      : 'This invoice covers work agreed with Bothmade outside the original project scope. Payment is processed securely by Stripe.',
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
  /**
   * True for the normal instalment sale — this invoice bills Payment 1 of 3.
   * False only when the client deliberately chose to settle the whole fee in
   * one go, which is the one case where a schedule would be a fiction.
   */
  depositOnly: boolean;
  /** Names the project on the instalment invoice; falls back to the service. */
  projectName?: string;
}

/** The scope itemisation both invoice forms draw from the same selection. */
function itemiseProposal(input: InvoiceForProposalInput): {
  lineItems: InvoiceLineItem[];
  adjustments: InvoiceLineItem[];
  subtotal: string;
} {
  const { baseService, addOnKeys, clientType, timeline, customItems, totalPrice } = input;
  const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
  const customTotal = customItemsTotal(customItems);
  const calculatedTotal = breakdown.totalPrice + customTotal;

  const lineItems: InvoiceLineItem[] = [
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

  return { lineItems, adjustments, subtotal: formatCents(breakdown.subtotal + customTotal) };
}

/**
 * Builds the invoice for a lead's current proposal selection — shared by the
 * sign-and-pay send, a standalone re-send, and a self-copy, so all three
 * always show identical numbers for the same underlying proposal.
 *
 * On the normal instalment sale this is **Payment 1 of 3**, and it says so in
 * 26-point type, on the same document as its two siblings, with the whole
 * schedule printed underneath. That symmetry is the point: for a long time the
 * first invoice was a different document that called the money a "deposit"
 * and mentioned no schedule at all, so the one payment every client actually
 * makes was the one that never explained what it was the first of.
 */
export async function buildInvoiceForProposal(input: InvoiceForProposalInput): Promise<Uint8Array> {
  const { leadId, company, contactName, baseService, totalPrice, depositOnly } = input;
  const { lineItems, adjustments, subtotal } = itemiseProposal(input);
  const invoiceNumber = leadId.slice(0, 8).toUpperCase();
  const date = invoiceDate(new Date());

  // Pay-in-full is the one sale with no schedule to show — three rows where
  // one of them is the entire fee reads as a mistake, not as clarity.
  if (!depositOnly) {
    return buildInvoicePdf({
      invoiceNumber,
      date,
      company,
      contactName,
      lineItems,
      adjustments,
      subtotal,
      total: formatCents(totalPrice),
      amountDue: formatCents(totalPrice),
      amountDueLabel: 'Amount due (paid in full)',
    });
  }

  const schedule = instalmentSchedule(totalPrice);
  return buildInstalmentInvoicePdf({
    invoiceNumber,
    date,
    company,
    contactName,
    projectName: input.projectName || `${company} — ${BASE_SERVICES[baseService].label}`,
    schedule: schedule.map((row) => ({
      label: row.label,
      amount: formatCentsExact(row.amountCents),
      // Nothing is paid yet — this invoice is what gets the first one paid.
      status: row.index === 1 ? ('due' as const) : ('scheduled' as const),
      triggerLabel: row.triggerLabel,
    })),
    instalmentIndex: 1,
    amountDue: formatCentsExact(schedule[0].amountCents),
    totalPrice: formatCents(totalPrice),
    dueDate: date,
    dueNow: true,
    gateLine: `Due on signing, before work begins — the first of ${schedule.length} payments across the project.`,
    lineItems,
    adjustments,
    subtotal,
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
  /**
   * Payment 1 falls due the moment it is signed, not in fourteen days —
   * printing "payable within 14 days" on the invoice that starts the work
   * would contradict the agreement it arrives with.
   */
  dueNow?: boolean;
  /** One sentence of gate context: "Due on Design Approval — approved August 4, 2026." */
  gateLine: string;
  /**
   * The scope, itemised. Only payment 1 carries it: that invoice is the
   * client's record of what they bought, while 2 and 3 bill a milestone
   * against a scope already agreed and would only repeat themselves.
   */
  lineItems?: InvoiceLineItem[];
  adjustments?: InvoiceLineItem[];
  subtotal?: string;
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
  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
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

  const logo = await doc.embedJpg(logoJpegBytes());
  const logoWidth = 140;
  const logoHeight = (logoWidth * LOGO_HEIGHT) / LOGO_WIDTH;

  /** The footer strip, drawn on every page as it is finished. */
  const drawFooterStrip = (onPage: PDFPage) => {
    onPage.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: 36, color: BRAND_FIELD });
    onPage.drawText(winAnsi(`${COMPANY_NAME} — ${COMPANY_EMAIL}`), { x: MARGIN, y: 14, size: 8.5, font, color: rgb(0.75, 0.78, 0.85) });
    const fr = winAnsi(input.invoiceNumber);
    onPage.drawText(fr, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(fr, 8.5), y: 14, size: 8.5, font, color: rgb(0.75, 0.78, 0.85) });
  };

  /**
   * Payment 1 carries the whole scope, and a scope can be forty add-ons long.
   * Everything below measures what it is about to draw and takes a fresh page
   * rather than writing into — or straight through — the footer strip.
   */
  const FLOOR = 36 + 24;
  const ensure = (needed: number) => {
    if (y - needed >= FLOOR) return;
    drawFooterStrip(page);
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 30, width: PAGE_WIDTH, height: 30, color: BRAND_FIELD });
    page.drawText(winAnsi(`Invoice ${input.invoiceNumber} — continued`), {
      x: MARGIN,
      y: PAGE_HEIGHT - 20,
      size: 9,
      font,
      color: rgb(0.75, 0.78, 0.85),
    });
    y = PAGE_HEIGHT - 30 - 32;
  };

  // Brand band with the wordmark on its own field.
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

  // The scope, when this invoice is the one that establishes it.
  if (input.lineItems && input.lineItems.length > 0) {
    ensure(46);
    text('WHAT THIS COVERS', MARGIN, { size: 9, f: bold, color: GRAY });
    textRight('AMOUNT', { size: 9, f: bold, color: GRAY });
    y -= 12;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LIGHT_GRAY });
    y -= 16;

    const scopeRow = (item: InvoiceLineItem, color = BLACK) => {
      const wrapped = wrapText(item.label, font, 10.5, CONTENT_WIDTH - 140);
      ensure(wrapped.length * 14 + 4);
      text(wrapped[0] ?? '', MARGIN, { size: 10.5, color });
      textRight(item.amount, { size: 10.5, color });
      y -= 14;
      for (const extra of wrapped.slice(1)) {
        text(extra, MARGIN, { size: 10.5, color: GRAY });
        y -= 13;
      }
    };

    for (const item of input.lineItems) scopeRow(item);
    if (input.adjustments && input.adjustments.length > 0) {
      y -= 4;
      for (const item of input.adjustments) scopeRow(item, GRAY);
    }

    ensure(48);
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LIGHT_GRAY });
    y -= 16;
    if (input.subtotal) {
      text('Subtotal', MARGIN, { size: 10.5, color: GRAY });
      textRight(input.subtotal, { size: 10.5, color: GRAY });
      y -= 16;
    }
    text('Project total', MARGIN, { size: 12, f: bold });
    textRight(input.totalPrice, { size: 12, f: bold });
    y -= 24;
  }

  // The schedule table: all three payments with live status, current row on
  // a tinted band.
  ensure(40 + input.schedule.length * 30);
  text('PAYMENT SCHEDULE', MARGIN, { size: 9, f: bold, color: GRAY });
  textRight(`Project total ${input.totalPrice}`, { size: 9, f: bold, color: GRAY });
  y -= 10;
  const ROW_H = 30;
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
  y -= 20;

  const remaining = input.schedule.length - input.instalmentIndex;
  const note =
    input.instalmentIndex >= input.schedule.length
      ? 'This is the final payment on your project. Once it clears, your site goes live and all files, credentials, and intellectual property transfer to you in full, as set out in your agreement.'
      : input.instalmentIndex === 1
      ? `This is the first of ${input.schedule.length} payments. The remaining ${remaining} are invoiced when you reach the milestones above — nothing is charged automatically, and nothing falls due before the work it pays for is in front of you. Payments are processed securely by Stripe; Bothmade never sees your card details.`
      : 'Per your agreement, work on the next phase begins once this payment is received. Payments are processed securely by Stripe; Bothmade never sees your card details.';
  const noteLines = wrapText(note, font, 9.5, CONTENT_WIDTH);

  // Amount due and its closing note are one block — splitting "Amount due"
  // from the sentence explaining it across a page break would be worse than
  // taking a fresh page for both.
  ensure(18 + 34 + noteLines.length * 13);
  text('Amount due', MARGIN, { size: 12, f: bold });
  textRight(input.amountDue, { size: 18, f: bold, color: ACCENT });
  y -= 18;
  text(
    input.dueNow
      ? 'Payable now, on signing. Work is scheduled once it clears.'
      : `Payable within 14 days, by ${input.dueDate}.`,
    MARGIN,
    { size: 10, color: GRAY }
  );
  y -= 34;

  for (const line of noteLines) {
    text(line, MARGIN, { size: 9.5, color: GRAY });
    y -= 13;
  }

  // Footer strip anchored to the page bottom, echoing the band.
  drawFooterStrip(page);

  return doc.save();
}
