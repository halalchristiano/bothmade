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
    drawRow('Amount due', input.amountDue, { f: bold, size: 13, color: ACCENT });
  }

  y -= 30;
  const footer = wrapText(
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
