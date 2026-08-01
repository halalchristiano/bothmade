import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
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

    const pdfBytes = await buildContractPdf({
      company: lead.company,
      contactName: lead.contactName,
      serviceLabel,
      addOnLabels,
      timelineLabel: `${TIMELINES[timeline].label} (${TIMELINES[timeline].weeks})`,
      clientTypeLabel: CLIENT_TYPES[clientType].label,
      basePrice: breakdown.basePrice,
      addOnsPrice: breakdown.addOnsPrice,
      totalPrice: breakdown.totalPrice,
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        type: 'proposal',
        content: `Contract generated: ${serviceLabel}${addOnLabels.length ? ` + ${addOnLabels.join(', ')}` : ''} — ${formatCents(breakdown.totalPrice)}`,
        createdById: session.userId,
      },
    });

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

async function buildContractPdf(input: {
  company: string;
  contactName: string | null;
  serviceLabel: string;
  addOnLabels: string[];
  timelineLabel: string;
  clientTypeLabel: string;
  basePrice: number;
  addOnsPrice: number;
  totalPrice: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  let y = 792 - margin;
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);

  const draw = (text: string, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const { size = 11, f = font, color = black, gap = 18 } = opts;
    page.drawText(text, { x: margin, y, size, font: f, color });
    y -= gap;
  };

  draw('Bothmade', { size: 22, f: bold, gap: 28 });
  draw('Project Agreement', { size: 14, f: bold, color: gray, gap: 30 });

  draw(`Client: ${input.company}`, { f: bold });
  if (input.contactName) draw(`Contact: ${input.contactName}`);
  draw(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { gap: 30 });

  draw('Scope of Work', { size: 13, f: bold, gap: 22 });
  draw(`Service: ${input.serviceLabel}`);
  if (input.addOnLabels.length > 0) {
    draw('Add-ons:');
    for (const label of input.addOnLabels) {
      draw(`  • ${label}`);
    }
  }
  draw(`Client Tier: ${input.clientTypeLabel}`);
  draw(`Timeline: ${input.timelineLabel}`, { gap: 30 });

  draw('Pricing', { size: 13, f: bold, gap: 22 });
  draw(`Base: ${formatCents(input.basePrice)}`);
  if (input.addOnsPrice > 0) draw(`Add-ons: ${formatCents(input.addOnsPrice)}`);
  draw(`Total: ${formatCents(input.totalPrice)}`, { f: bold, gap: 30 });

  draw('Terms', { size: 13, f: bold, gap: 22 });
  const terms = [
    'This agreement covers the scope described above. Any work beyond this scope will be quoted',
    'separately before starting. A 50% deposit is due to begin work, with the balance due before',
    'final delivery/launch. Bothmade retains ownership of all work until paid in full, at which point',
    'ownership of the final deliverable transfers to the client. Either party may cancel with written',
    'notice; work completed to date will be billed at the rates above.',
  ];
  for (const line of terms) {
    draw(line, { size: 10, color: gray, gap: 14 });
  }
  y -= 20;

  draw('This is a standard-terms template — please have it reviewed before relying on it as a', {
    size: 9,
    color: gray,
    gap: 12,
  });
  draw('binding legal document.', { size: 9, color: gray, gap: 40 });

  draw('Signatures', { size: 13, f: bold, gap: 30 });
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 220, y }, thickness: 1, color: gray });
  page.drawLine({ start: { x: margin + 260, y }, end: { x: margin + 480, y }, thickness: 1, color: gray });
  y -= 14;
  draw('Client Signature / Date', { size: 9, color: gray, gap: 30 });
  page.drawText('Bothmade Signature / Date', { x: margin + 260, y: y + 30, size: 9, font, color: gray });

  return doc.save();
}
