import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildContractPdf } from '@/lib/contract-pdf';
import { buildContractSections, toContractCustomItems } from '@/lib/contract-terms';
import type { CustomItem } from '@/lib/pricing';

/**
 * Custom work is the one part of a proposal with no shared definition
 * behind it. "SEO Foundations" means the same thing on every contract
 * Bothmade sends; "Custom integration — $4,000" means whatever each side
 * assumed it meant, and the gap shows up mid-build. These cover the half of
 * the fix that lives in the document: the scope Evan wrote has to actually
 * appear in the contract, verbatim, and be stated as the thing that
 * controls.
 */

const CUSTOM: CustomItem[] = [
  {
    label: 'Custom integration',
    description:
      'Two-way sync between the site booking form and their existing Dentrix install, running every 15 minutes. Excludes changes inside Dentrix itself.',
    priceCents: 400000,
  },
];

const PARAMS = {
  company: 'Northgate Dental Group',
  contactName: 'Priya Raman',
  serviceLabel: 'Custom Website',
  serviceDescription: 'A bespoke marketing site.',
  addOnLabels: ['SEO Foundations'],
  addOnKeys: ['seo'],
  baseServiceKey: 'website',
  clientTypeKey: 'smb',
  timelineKey: 'standard',
  timelineLabel: 'Standard (6-8 weeks)',
  clientTypeLabel: 'Small Business',
  basePrice: '$6,000',
  addOnsPrice: '$5,200',
  totalPrice: '$11,200',
  depositAmount: '$5,600',
  balanceAmount: '$5,600',
  depositPercent: 50,
  effectiveDate: 'August 4, 2026',
};

const findSection = (sections: ReturnType<typeof buildContractSections>, heading: string) =>
  sections.find((s) => s.heading === heading);

describe('custom work in the contract', () => {
  it('states each custom item and its scope in full', () => {
    const sections = buildContractSections({ ...PARAMS, customItems: toContractCustomItems(CUSTOM) });
    const section = findSection(sections, 'Custom Work — Agreed Scope');

    expect(section).toBeDefined();
    expect(section!.paragraphs.some((p) => p.includes(CUSTOM[0].description))).toBe(true);
    expect(section!.paragraphs.some((p) => p.includes('Custom integration') && p.includes('$4,000'))).toBe(true);
  });

  it('makes the description control over the label used elsewhere', () => {
    // The whole point: an invoice line reading "Custom integration" can't
    // later be read as something wider than what was written down.
    const sections = buildContractSections({ ...PARAMS, customItems: toContractCustomItems(CUSTOM) });
    const text = findSection(sections, 'Custom Work — Agreed Scope')!.paragraphs.join(' ');

    expect(text).toContain('definitive');
    expect(text).toContain('controls over');
    expect(text).toContain('Change Order');
  });

  it('points Section 3 at the custom scope so it is part of the scope of work', () => {
    const sections = buildContractSections({ ...PARAMS, customItems: toContractCustomItems(CUSTOM) });
    const scope = findSection(sections, '3. Scope of Work')!.paragraphs.join(' ');

    expect(scope).toContain('Custom Work — Agreed Scope');
  });

  it('leaves the contract untouched when there is no custom work', () => {
    const sections = buildContractSections({ ...PARAMS, customItems: [] });

    expect(findSection(sections, 'Custom Work — Agreed Scope')).toBeUndefined();
    expect(findSection(sections, '3. Scope of Work')!.paragraphs.join(' ')).not.toContain('Custom Work');
  });

  it('omits the section for a link sent before descriptions were required', async () => {
    // Those links are still live and the client can still sign them. What
    // they must not produce is a contract asserting a scope clause with
    // nothing in it — the item stays in the fee lines and says no more than
    // it did when the link went out.
    const legacy: CustomItem[] = [{ label: 'Custom integration', description: '', priceCents: 400000 }];
    const params = { ...PARAMS, customItems: toContractCustomItems(legacy) };
    const sections = buildContractSections(params);

    expect(findSection(sections, 'Custom Work — Agreed Scope')).toBeUndefined();
    expect(findSection(sections, '3. Scope of Work')!.paragraphs.join(' ')).not.toContain('Custom Work');

    const bytes = await buildContractPdf({
      company: PARAMS.company,
      contactName: PARAMS.contactName,
      serviceLabel: PARAMS.serviceLabel,
      addOnLabels: PARAMS.addOnLabels,
      customItems: params.customItems,
      timelineLabel: PARAMS.timelineLabel,
      basePrice: PARAMS.basePrice,
      addOnsPrice: PARAMS.addOnsPrice,
      totalPrice: PARAMS.totalPrice,
      depositAmount: PARAMS.depositAmount,
      sections,
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('describes the items it can, when only some were left blank', () => {
    const mixed: CustomItem[] = [{ label: 'Data cleanup', description: '', priceCents: 400000 }, CUSTOM[0]];
    const section = findSection(
      buildContractSections({ ...PARAMS, customItems: toContractCustomItems(mixed) }),
      'Custom Work — Agreed Scope'
    );

    expect(section).toBeDefined();
    expect(section!.paragraphs.some((p) => p.includes('Data cleanup'))).toBe(false);
    expect(section!.paragraphs.some((p) => p.includes(CUSTOM[0].description))).toBe(true);
  });

  it('still builds for a caller that passes no custom items at all', () => {
    const { customItems, ...withoutCustom } = { ...PARAMS, customItems: [] };
    void customItems;

    expect(() => buildContractSections(withoutCustom)).not.toThrow();
  });

  it('renders the scope on the PDF summary page', async () => {
    const bytes = await buildContractPdf({
      company: PARAMS.company,
      contactName: PARAMS.contactName,
      serviceLabel: PARAMS.serviceLabel,
      addOnLabels: PARAMS.addOnLabels,
      customItems: toContractCustomItems(CUSTOM),
      timelineLabel: PARAMS.timelineLabel,
      basePrice: PARAMS.basePrice,
      addOnsPrice: PARAMS.addOnsPrice,
      totalPrice: PARAMS.totalPrice,
      depositAmount: PARAMS.depositAmount,
      sections: buildContractSections({ ...PARAMS, customItems: toContractCustomItems(CUSTOM) }),
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('does not throw on a description long enough to spill across pages', async () => {
    // A rep pasting a full spec into the box must not produce a PDF that
    // fails to build — the summary block wraps and paginates like any
    // other paragraph.
    const long: CustomItem[] = [
      { label: 'Data migration', description: 'Migrate every record. '.repeat(200), priceCents: 900000 },
    ];

    const bytes = await buildContractPdf({
      company: PARAMS.company,
      contactName: PARAMS.contactName,
      serviceLabel: PARAMS.serviceLabel,
      addOnLabels: [],
      customItems: toContractCustomItems(long),
      timelineLabel: PARAMS.timelineLabel,
      basePrice: PARAMS.basePrice,
      addOnsPrice: PARAMS.addOnsPrice,
      totalPrice: PARAMS.totalPrice,
      depositAmount: PARAMS.depositAmount,
      sections: buildContractSections({ ...PARAMS, customItems: toContractCustomItems(long) }),
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(3);
  });
});
