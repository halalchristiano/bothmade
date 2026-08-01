import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { buildContractSections } from '@/lib/contract-terms';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  DEPOSIT_PERCENT,
  TIMELINES,
  calculatePrice,
  depositAmount,
  formatCents,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  type AddOnKey,
} from '@/lib/pricing';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { leadId } = await params;
    const { baseService, addOns = [], clientType, timeline } = await request.json();

    if (!isBaseService(baseService) || !isClientType(clientType) || !isTimelineKey(timeline)) {
      return NextResponse.json({ error: 'Invalid selection' }, { status: 400 });
    }
    const addOnKeys: AddOnKey[] = Array.isArray(addOns) ? addOns.filter(isAddOnKey) : [];

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
    const serviceLabel = BASE_SERVICES[baseService].label;
    const addOnLabels = addOnKeys.map((k) => ADD_ONS[k].label);
    const deposit = depositAmount(breakdown.totalPrice);

    const sections = buildContractSections({
      company: lead.company,
      contactName: lead.contactName,
      serviceLabel,
      serviceDescription: BASE_SERVICES[baseService].description,
      addOnLabels,
      addOnKeys,
      baseServiceKey: baseService,
      clientTypeKey: clientType,
      timelineKey: timeline,
      timelineLabel: `${TIMELINES[timeline].label} (${TIMELINES[timeline].weeks})`,
      clientTypeLabel: CLIENT_TYPES[clientType].label,
      basePrice: formatCents(breakdown.basePrice),
      addOnsPrice: formatCents(breakdown.addOnsPrice),
      totalPrice: formatCents(breakdown.totalPrice),
      depositAmount: formatCents(deposit),
      balanceAmount: formatCents(breakdown.totalPrice - deposit),
      depositPercent: DEPOSIT_PERCENT,
      effectiveDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    });

    const pdfBytes = await buildContractPdf({
      company: lead.company,
      contactName: lead.contactName,
      serviceLabel,
      addOnLabels,
      timelineLabel: `${TIMELINES[timeline].label} (${TIMELINES[timeline].weeks})`,
      basePrice: formatCents(breakdown.basePrice),
      addOnsPrice: formatCents(breakdown.addOnsPrice),
      totalPrice: formatCents(breakdown.totalPrice),
      depositAmount: formatCents(deposit),
      sections,
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        type: 'proposal',
        content: `Contract generated: ${serviceLabel}${addOnLabels.length ? ` + ${addOnLabels.join(', ')}` : ''} — ${formatCents(breakdown.totalPrice)}`,
        createdById: session.userId,
      },
    });

    if (lead.contractStatus === 'not_sent') {
      await prisma.lead.update({ where: { id: leadId }, data: { contractStatus: 'sent' } });
    }

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${lead.company.replace(/[^a-z0-9]/gi, '-')}-contract.pdf"`,
      },
    });
  } catch (error) {
    console.error('Generate contract error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLACK = rgb(0.08, 0.08, 0.1);
const GRAY = rgb(0.42, 0.42, 0.46);
const ACCENT = rgb(0.13, 0.55, 0.85);

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

async function buildContractPdf(input: {
  company: string;
  contactName: string | null;
  serviceLabel: string;
  addOnLabels: string[];
  timelineLabel: string;
  basePrice: string;
  addOnsPrice: string;
  totalPrice: string;
  depositAmount: string;
  sections: ReturnType<typeof buildContractSections>;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageNum = 1;

  const finishPage = () => {
    page.drawText(`Bothmade — Project Agreement — Page ${pageNum}`, {
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

  // Cover page
  drawLine('Bothmade', { size: 26, f: bold, gap: 34 });
  drawLine('Project Agreement', { size: 15, f: bold, color: ACCENT, gap: 36 });
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

  finishPage();

  return doc.save();
}
