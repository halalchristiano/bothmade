import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLACK = rgb(0.08, 0.08, 0.1);
const GRAY = rgb(0.42, 0.42, 0.46);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.87);
const ACCENT = rgb(0.13, 0.55, 0.85);

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

  const drawText = (
    text: string,
    x: number,
    opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}
  ) => {
    const { size = 11, f = font, color = BLACK } = opts;
    page.drawText(text, { x, y, size, font: f, color });
  };

  const drawRow = (label: string, amount: string, opts: { f?: PDFFont; color?: ReturnType<typeof rgb>; size?: number } = {}) => {
    const { f = font, color = BLACK, size = 11 } = opts;
    const wrapped = wrapText(label, f, size, CONTENT_WIDTH - 140);
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

  // Header
  drawText('Bothmade', MARGIN, { size: 24, f: bold });
  drawText('INVOICE', PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize('INVOICE', 18), { size: 18, f: bold, color: ACCENT });
  y -= 34;

  drawText(`Invoice #${input.invoiceNumber}`, MARGIN, { size: 10, color: GRAY });
  drawText(
    input.date,
    PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(input.date, 10),
    { size: 10, color: GRAY }
  );
  y -= 30;

  // Bill to
  drawText('Bill to', MARGIN, { size: 9, f: bold, color: GRAY });
  y -= 16;
  drawText(input.company, MARGIN, { size: 12, f: bold });
  y -= 16;
  if (input.contactName) {
    drawText(input.contactName, MARGIN, { size: 11, color: GRAY });
    y -= 16;
  }
  y -= 14;

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
