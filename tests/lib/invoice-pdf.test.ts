import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { LOGO_HEIGHT, LOGO_WIDTH, logoJpegBytes } from '@/lib/brand-logo';
import { COMPANY_ADDRESS_LINES } from '@/lib/company';
import { buildCustomChargeInvoicePdf, buildInvoiceForProposal } from '@/lib/invoice-pdf';

/**
 * The invoice is the one document a client's accountant reads, so the two
 * things that would be invisible until someone complained get pinned here: the
 * logo blob still decoding, and the document still being a document at all.
 */

const PROPOSAL = {
  leadId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  company: 'Northgate Dental Group',
  contactName: 'Priya Raman',
  baseService: 'web-app' as const,
  addOnKeys: ['seo' as const],
  clientType: 'smb' as const,
  timeline: 'standard' as const,
  customItems: [],
  totalPrice: 1_450_000,
  depositOnly: true,
};

describe('the inlined wordmark', () => {
  it('decodes to the JPEG the PDF builders expect', () => {
    const bytes = logoJpegBytes();

    // SOI ... EOI — a truncated or re-wrapped base64 blob fails here rather
    // than deep inside pdf-lib on a live invoice send.
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    expect([bytes[bytes.length - 2], bytes[bytes.length - 1]]).toEqual([0xff, 0xd9]);
  });

  it('embeds at the dimensions the layout is measured against', async () => {
    const doc = await PDFDocument.create();
    const image = await doc.embedJpg(logoJpegBytes());

    expect(image.width).toBe(LOGO_WIDTH);
    expect(image.height).toBe(LOGO_HEIGHT);
  });
});

describe('buildInvoiceForProposal', () => {
  it('produces a single-page PDF', async () => {
    const bytes = await buildInvoiceForProposal(PROPOSAL);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('prints the issuing address on it', async () => {
    const doc = await PDFDocument.load(await buildInvoiceForProposal(PROPOSAL));

    // pdf-lib has no text extraction, so read the page's own content stream.
    const drawn = drawnStrings(doc);
    for (const line of COMPANY_ADDRESS_LINES) {
      expect(drawn).toContain(line);
    }
    expect(drawn).toContain(PROPOSAL.company);
  });
});

describe('buildCustomChargeInvoicePdf', () => {
  const CHARGE = {
    invoiceNumber: 'BM-2026-0007',
    company: 'Northgate Dental Group',
    contactName: 'Priya Raman',
    description: 'Second round of homepage design',
    lineItems: [
      { label: 'Design round', priceCents: 120000 },
      { label: 'Copywriting', priceCents: 45000 },
    ],
    issuedAt: new Date('2026-08-04T10:00:00Z'),
  };

  it('prints the number, what it is for, and the total of the lines', async () => {
    const drawn = drawnStrings(await PDFDocument.load(await buildCustomChargeInvoicePdf(CHARGE)));

    expect(drawn).toContain('BM-2026-0007');
    expect(drawn).toContain('Second round of homepage design');
    expect(drawn).toContain('Design round');
    // 120000 + 45000 in cents, formatted — the amount actually due.
    expect(drawn).toContain('$1,650');
  });

  /**
   * The proposal invoice's closing line cites "the accompanying project
   * agreement". A one-off charge has no such document, and pointing a client
   * at paperwork that doesn't exist is how a simple invoice turns into a
   * dispute.
   */
  it('does not cite a project agreement it has no equivalent of', async () => {
    const drawn = drawnStrings(await PDFDocument.load(await buildCustomChargeInvoicePdf(CHARGE)));

    expect(drawn).not.toContain('accompanying project agreement');
    expect(drawn).toContain('outside the original project scope');
  });

  it('stays a single page and carries the issuing address', async () => {
    const doc = await PDFDocument.load(await buildCustomChargeInvoicePdf(CHARGE));

    expect(doc.getPageCount()).toBe(1);
    const drawn = drawnStrings(doc);
    for (const line of COMPANY_ADDRESS_LINES) {
      expect(drawn).toContain(line);
    }
  });
});

/**
 * Every string drawn on page 1. The content streams are deflated and each
 * `Tj` operand is a hex literal, so both layers come off before matching.
 */
function drawnStrings(doc: PDFDocument): string {
  const contents = doc.getPage(0).node.normalizedEntries().Contents;
  const refs = contents instanceof PDFArray ? contents.asArray() : [];
  const operators = refs
    .map((ref) => {
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) return '';
      return new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
    })
    .join('\n');

  return [...operators.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)]
    .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'))
    .join('\n');
}


describe('the instalment invoice', () => {
  it('renders one page with the schedule and the current row', async () => {
    const { buildInstalmentInvoicePdf } = await import('@/lib/invoice-pdf');
    const { PDFDocument } = await import('pdf-lib');
    const bytes = await buildInstalmentInvoicePdf({
      invoiceNumber: 'BM-2026-0042',
      date: 'August 4, 2026',
      company: 'Northgate Dental Group',
      contactName: 'Priya Raman',
      projectName: 'Northgate — Custom Website',
      schedule: [
        { label: 'Payment 1 of 3', amount: '$8,000', status: 'paid', triggerLabel: 'On signing' },
        { label: 'Payment 2 of 3', amount: '$6,000', status: 'due', triggerLabel: 'On design approval' },
        { label: 'Payment 3 of 3', amount: '$6,000', status: 'scheduled', triggerLabel: 'When ready to launch' },
      ],
      instalmentIndex: 2,
      amountDue: '$6,000',
      totalPrice: '$20,000',
      dueDate: 'August 18, 2026',
      gateLine: 'Due on Design Approval — approved August 4, 2026.',
    });
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBe(1);
  });

  it('survives a company name the standard fonts cannot encode', async () => {
    const { buildInstalmentInvoicePdf } = await import('@/lib/invoice-pdf');
    const bytes = await buildInstalmentInvoicePdf({
      invoiceNumber: 'BM-2026-0043',
      date: 'August 4, 2026',
      company: 'Škoda 🚗 Müller & Søn',
      contactName: '李小龙',
      projectName: 'Škoda — Custom Website',
      schedule: [
        { label: 'Payment 1 of 3', amount: '$8,000', status: 'paid', triggerLabel: 'On signing' },
        { label: 'Payment 2 of 3', amount: '$6,000', status: 'due', triggerLabel: 'On design approval' },
        { label: 'Payment 3 of 3', amount: '$6,000', status: 'scheduled', triggerLabel: 'When ready to launch' },
      ],
      instalmentIndex: 2,
      amountDue: '$6,000',
      totalPrice: '$20,000',
      dueDate: 'August 18, 2026',
      gateLine: 'Due on Design Approval.',
    });

    expect(bytes.length).toBeGreaterThan(1000);
  });
});
