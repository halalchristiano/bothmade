import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { LOGO_BACKGROUND, LOGO_HEIGHT, LOGO_WIDTH, logoJpegBytes } from '@/lib/brand-logo';
import { COMPANY_ADDRESS_INLINE, COMPANY_ADDRESS_LINES, COMPANY_EMAIL, COMPANY_NAME } from '@/lib/company';
import type { ContractSection } from '@/lib/contract-terms';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLACK = rgb(0.08, 0.08, 0.1);
const GRAY = rgb(0.42, 0.42, 0.46);
const ACCENT = rgb(0.13, 0.55, 0.85);
const GREEN = rgb(0.1, 0.5, 0.3);
const BRAND_FIELD = rgb(LOGO_BACKGROUND.r, LOGO_BACKGROUND.g, LOGO_BACKGROUND.b);
const BAND_HEIGHT = 66;

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

export interface ContractPdfInput {
  company: string;
  contactName: string | null;
  serviceLabel: string;
  addOnLabels: string[];
  timelineLabel: string;
  basePrice: string;
  addOnsPrice: string;
  totalPrice: string;
  depositAmount: string;
  sections: ContractSection[];
  /** When set, the signature page shows this as a digitally-executed
   * agreement (timestamp + IP) instead of blank signature lines — the
   * saved copy of what the client actually clicked "I agree" to. */
  signedOnline?: { at: Date; ip: string };
}

/** Builds the contract PDF — shared by the admin "download contract" action
 * and the saved copy generated the moment a client agrees online. */
export async function buildContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageNum = 1;

  const finishPage = () => {
    page.drawText(`${COMPANY_NAME} — ${COMPANY_ADDRESS_INLINE}`, {
      x: MARGIN,
      y: 42,
      size: 8,
      font,
      color: GRAY,
    });
    page.drawText(`Project Agreement — Page ${pageNum}`, {
      x: MARGIN,
      y: 30,
      size: 8,
      font,
      color: GRAY,
    });
  };

  const newPage = () => {
    finishPage();
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNum += 1;
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 20) newPage();
  };

  const drawLine = (text: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const { size = 11, f = font, color = BLACK, gap = 16 } = opts;
    ensureSpace(gap);
    page.drawText(text, { x: MARGIN, y, size, font: f, color });
    y -= gap;
  };

  const drawParagraph = (text: string, opts: { size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const { size = 10, color = BLACK, gap = 13.5 } = opts;
    const lines = wrapText(text, font, size, CONTENT_WIDTH);
    for (const line of lines) {
      ensureSpace(gap);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= gap;
    }
    y -= 6; // paragraph spacing
  };

  // Cover page — the wordmark sits on its own near-black field, so the band
  // behind it is drawn in the same colour and the two read as one mark.
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
  y = PAGE_HEIGHT - BAND_HEIGHT - 34;

  drawLine('Project Agreement', { size: 15, f: bold, color: ACCENT, gap: 30 });
  drawLine(COMPANY_NAME, { f: bold, size: 12, gap: 16 });
  for (const line of COMPANY_ADDRESS_LINES) {
    drawLine(line, { size: 10, color: GRAY, gap: 13 });
  }
  drawLine(COMPANY_EMAIL, { size: 10, color: GRAY, gap: 28 });
  drawLine(`Client: ${input.company}`, { f: bold, size: 12, gap: 20 });
  if (input.contactName) drawLine(`Contact: ${input.contactName}`, { size: 11, gap: 18 });
  drawLine(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, {
    size: 11,
    color: GRAY,
    gap: 30,
  });

  drawLine('Project Summary', { size: 13, f: bold, gap: 22 });
  drawParagraph(`Service: ${input.serviceLabel}`, { size: 11 });
  if (input.addOnLabels.length > 0) {
    drawParagraph(`Add-ons: ${input.addOnLabels.join(', ')}`, { size: 11 });
  }
  drawParagraph(`Timeline: ${input.timelineLabel}`, { size: 11 });
  y -= 8;
  drawLine('Fees', { size: 13, f: bold, gap: 22 });
  drawParagraph(`Base: ${input.basePrice}${input.addOnsPrice !== '$0' ? `  +  Add-ons: ${input.addOnsPrice}` : ''}`, { size: 11 });
  drawLine(`Total: ${input.totalPrice}`, { f: bold, size: 14, gap: 22 });
  drawParagraph(`Deposit due to begin work: ${input.depositAmount}`, { size: 11, color: GRAY });

  y -= 10;
  drawParagraph(
    'The following pages set out the full terms and conditions governing this engagement. Please read them carefully. This document is generated from a standard template — Bothmade recommends having it reviewed by your own counsel before treating it as final and binding.',
    { size: 9, color: GRAY, gap: 13 }
  );

  // Terms sections
  newPage();
  drawLine('Terms and Conditions', { size: 16, f: bold, gap: 30 });

  for (const section of input.sections) {
    ensureSpace(40);
    drawLine(section.heading, { size: 12.5, f: bold, color: ACCENT, gap: 20 });
    for (const paragraph of section.paragraphs) {
      drawParagraph(paragraph);
    }
    y -= 4;
  }

  // Signature page
  newPage();
  drawLine('Signatures', { size: 16, f: bold, gap: 34 });

  if (input.signedOnline) {
    drawParagraph(
      'This agreement was reviewed and accepted electronically. Proceeding to payment constituted acceptance of the terms in full, recorded below.',
      { size: 10, gap: 20 }
    );
    y -= 10;
    drawLine('✓ Digitally agreed', { f: bold, size: 12, color: GREEN, gap: 20 });
    drawParagraph(`Client: ${input.contactName || input.company} (${input.company})`, { size: 10 });
    drawParagraph(
      `Agreed: ${input.signedOnline.at.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}`,
      { size: 10 }
    );
    drawParagraph(`Recorded from IP: ${input.signedOnline.ip}`, { size: 10, color: GRAY });
  } else {
    drawParagraph(
      'By signing below (or by making the deposit payment referenced in Section 6), both Parties agree to be bound by the terms of this Agreement in full.',
      { size: 10, gap: 20 }
    );
    y -= 30;

    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 220, y }, thickness: 1, color: GRAY });
    page.drawLine({ start: { x: MARGIN + 280, y }, end: { x: MARGIN + 500, y }, thickness: 1, color: GRAY });
    y -= 14;
    page.drawText('Client Signature', { x: MARGIN, y, size: 9, font, color: GRAY });
    page.drawText('Bothmade Signature', { x: MARGIN + 280, y, size: 9, font, color: GRAY });
    y -= 40;

    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 220, y }, thickness: 1, color: GRAY });
    page.drawLine({ start: { x: MARGIN + 280, y }, end: { x: MARGIN + 500, y }, thickness: 1, color: GRAY });
    y -= 14;
    page.drawText('Date', { x: MARGIN, y, size: 9, font, color: GRAY });
    page.drawText('Date', { x: MARGIN + 280, y, size: 9, font, color: GRAY });
  }

  finishPage();

  return doc.save();
}
