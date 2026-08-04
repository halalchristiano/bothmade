import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { CLICKWRAP_STATEMENT } from '@/lib/clickwrap';
import { buildContractPdf } from '@/lib/contract-pdf';

/**
 * The signed copy is generated inside a try/catch, because a PDF failure
 * must never stand between a client and paying us. The cost of that is that
 * a PDF failure is silent: the signature gets written, the blob doesn't,
 * and the only sign is a `signedContractUrl` that stayed null. So the
 * things that would throw — a character the standard fonts can't encode,
 * a long string with no spaces to wrap on — get caught here instead.
 */

const BASE = {
  company: 'Northgate Dental Group',
  contactName: 'Priya Raman',
  serviceLabel: 'Custom Website',
  addOnLabels: ['SEO Foundations'],
  timelineLabel: 'Standard (6-8 weeks)',
  basePrice: '$6,000',
  addOnsPrice: '$1,200',
  totalPrice: '$7,200',
  depositAmount: '$3,600',
  sections: [
    { heading: '1. The Engagement', paragraphs: ['The Agency will design and build the Project.'] },
  ],
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36';

describe('buildContractPdf', () => {
  it('renders the blank-signature-line version', async () => {
    const bytes = await buildContractPdf(BASE);
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('renders the executed version with every field the route now records', async () => {
    const bytes = await buildContractPdf({
      ...BASE,
      signedOnline: {
        at: new Date('2026-08-03T15:04:00Z'),
        ip: '203.0.113.7',
        signerName: 'Priya Raman',
        userAgent: UA,
        statement: CLICKWRAP_STATEMENT,
      },
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('renders a signature taken before the name and browser were captured', async () => {
    // Rows signed before the evidence columns existed have nulls in them,
    // and the admin "download contract" button still has to work on those.
    const bytes = await buildContractPdf({
      ...BASE,
      signedOnline: { at: new Date('2026-07-01T10:00:00Z'), ip: 'unknown' },
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('survives a name and user agent full of characters the standard fonts hate', async () => {
    // Names carry accents and apostrophes; user agents are whatever the
    // caller sent. Neither may take the document down.
    await expect(
      buildContractPdf({
        ...BASE,
        contactName: 'Zoë Ó Faoláin-Mbeki',
        signedOnline: {
          at: new Date('2026-08-03T15:04:00Z'),
          ip: '203.0.113.7',
          signerName: 'Zoë Ó Faoláin-Mbeki',
          userAgent: 'A'.repeat(400),
          statement: CLICKWRAP_STATEMENT,
        },
      })
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
