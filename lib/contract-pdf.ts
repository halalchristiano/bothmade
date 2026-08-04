import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { LOGO_BACKGROUND, LOGO_HEIGHT, LOGO_WIDTH, logoJpegBytes } from '@/lib/brand-logo';
import { COMPANY_ADDRESS_INLINE, COMPANY_ADDRESS_LINES, COMPANY_EMAIL, COMPANY_NAME } from '@/lib/company';
import { winAnsi } from '@/lib/pdf-text';
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
    let rest = word;
    // A "word" wider than the column has nowhere to wrap — a user agent
    // header with no spaces in it, say. Break it rather than let it run off
    // the edge of the page.
    while (font.widthOfTextAtSize(rest, size) > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      let cut = rest.length;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (!rest) continue;

    const candidate = current ? `${current} ${rest}` : rest;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = rest;
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
   * agreement (name, timestamp, IP, browser) instead of blank signature
   * lines — the saved copy of what the client actually clicked "I agree"
   * to. The optional fields are optional because signatures taken before
   * they were captured still have to render. */
  signedOnline?: { at: Date; ip: string; signerName?: string; userAgent?: string; statement?: string };
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

  const drawLine = (raw: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const { size = 11, f = font, color = BLACK, gap = 16 } = opts;
    ensureSpace(gap);
    page.drawText(winAnsi(raw), { x: MARGIN, y, size, font: f, color });
    y -= gap;
  };

  const drawParagraph = (raw: string, opts: { size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const { size = 10, color = BLACK, gap = 13.5 } = opts;
    // Sanitize before measuring: widthOfTextAtSize looks the glyphs up in
    // the same table drawText does, so an unencodable character throws
    // during wrapping rather than during drawing.
    const lines = wrapText(winAnsi(raw), font, size, CONTENT_WIDTH);
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
    // Spelled out rather than marked with a tick: WinAnsi has no checkmark
    // glyph, and the standard fonts throw on characters they can't encode.
    drawLine('SIGNED ELECTRONICALLY', { f: bold, size: 12, color: GREEN, gap: 20 });

    // The typed name is the signature. Set larger than the surrounding text
    // so the page reads the way a signed page reads — a name, then the
    // machine detail underneath it.
    if (input.signedOnline.signerName) {
      drawLine(`Signed by: ${input.signedOnline.signerName}`, { f: bold, size: 13, gap: 20 });
    }
    drawParagraph(`Client: ${input.contactName || input.company} (${input.company})`, { size: 10 });
    drawParagraph(
      `Agreed: ${input.signedOnline.at.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })}`,
      { size: 10 }
    );
    drawParagraph(`Recorded from IP: ${input.signedOnline.ip}`, { size: 10, color: GRAY });
    if (input.signedOnline.userAgent) {
      drawParagraph(`Browser: ${input.signedOnline.userAgent}`, { size: 9, color: GRAY });
    }

    // Quoting the sentence they ticked is the difference between a record
    // that says they agreed and a record that says what agreeing meant.
    if (input.signedOnline.statement) {
      y -= 6;
      drawParagraph('Statement accepted:', { size: 9, color: GRAY, gap: 12 });
      drawParagraph(`"${input.signedOnline.statement}"`, { size: 9.5 });
    }
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
