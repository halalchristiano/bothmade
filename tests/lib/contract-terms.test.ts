import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildContractPdf } from '@/lib/contract-pdf';
import {
  AGENCY_RATE_CENTS,
  buildContractSections,
  type ContractParams,
} from '@/lib/contract-terms';

/**
 * The contract is generated, so a drafting mistake is not one bad document —
 * it is every document until someone notices. These tests pin the things a
 * client or a court would actually hold us to: the party who can be sued is
 * named, the instalment figures are the ones the schedule means, the business
 * form never carries consumer-only rights, the consumer form always carries
 * the ones the law requires, and the clauses we deliberately deleted stay
 * deleted.
 */

const BASE: ContractParams = {
  company: 'Northgate Dental Group',
  contactName: 'Priya Raman',
  serviceLabel: 'Custom Website',
  serviceDescription: 'A marketing site built to convert.',
  addOnLabels: ['SEO Foundations'],
  addOnKeys: ['seo'],
  baseServiceKey: 'website',
  clientTypeKey: 'small-business',
  timelineKey: 'standard',
  timelineLabel: 'Standard (8-12 weeks)',
  clientTypeLabel: 'Small Business',
  basePrice: '$16,000',
  addOnsPrice: '$4,000',
  totalPrice: '$20,000',
  totalPriceCents: 2_000_000,
  effectiveDate: 'August 4, 2026',
};

const SMALL: ContractParams = {
  ...BASE,
  basePrice: '$15,000',
  addOnsPrice: '$0',
  totalPrice: '$15,000',
  totalPriceCents: 1_500_000,
};

function section(p: ContractParams, startsWith: string) {
  const found = buildContractSections(p).find((s) => s.heading.startsWith(startsWith));
  if (!found) throw new Error(`No section starting "${startsWith}"`);
  return found.paragraphs.join('\n');
}

function whole(p: ContractParams) {
  return buildContractSections(p)
    .flatMap((s) => [s.heading, ...s.paragraphs])
    .join('\n');
}

describe('the parties', () => {
  it('names the person who can actually be sued, not just the brand', () => {
    expect(section(BASE, '2.')).toContain('Kiana Arabpour, trading as Bothmade');
  });

  it('carries the business-capacity warranty on the B2B form', () => {
    expect(section(BASE, '2.')).toContain('not as a consumer');
  });

  it('swaps the warranty for a consumer statement on the consumer form', () => {
    const consumer = section({ ...BASE, isConsumer: true }, '2.');

    expect(consumer).toContain('as a consumer');
    expect(consumer).not.toContain('warrants that it enters this Agreement in the course of a trade');
  });
});

describe('the instalment schedule in the contract', () => {
  it('bills a $20,000 project 40/30/30 — the threshold is inclusive', () => {
    const fees = section(BASE, '7.');

    expect(fees).toContain('Payment 1 of 3 — $8,000 (40% of the Total Fee)');
    expect(fees).toContain('Payment 2 of 3 — $6,000 (30% of the Total Fee)');
    expect(fees).toContain('Payment 3 of 3 — $6,000 (30% of the Total Fee)');
  });

  it('bills a $15,000 project 50/25/25 over the same gates', () => {
    const fees = section(SMALL, '7.');

    expect(fees).toContain('Payment 1 of 3 — $7,500 (50% of the Total Fee)');
    expect(fees).toContain('Payment 2 of 3 — $3,750 (25% of the Total Fee)');
    expect(fees).toContain('Payment 3 of 3 — $3,750 (25% of the Total Fee)');
  });

  it('ties payment 2 to Design Approval and payment 3 to Ready for Launch, 14-day terms', () => {
    const fees = section(BASE, '7.');

    expect(fees).toContain('due on Design Approval');
    expect(fees).toContain('Ready for Launch');
    expect(fees).toMatch(/payable within fourteen \(14\) days/);
  });

  it('hands nothing over until the final instalment clears', () => {
    expect(section(BASE, '7.')).toContain('Nothing goes live');
    expect(section(BASE, '13.')).toContain('final Instalment');
  });

  it('restates the schedule in Exhibit B with the same figures', () => {
    const exhibit = section(BASE, 'Exhibit B');

    expect(exhibit).toContain('$8,000');
    expect(exhibit).toContain('40% / 30% / 30%');
    expect(exhibit).toContain('50% / 25% / 25%');
  });

  it('says the fees are USD and that no VAT is charged while unregistered', () => {
    const fees = section(BASE, '7.');

    expect(fees).toContain('United States dollars');
    expect(fees).toContain('not registered for VAT');
  });
});

describe('cancellation and refunds — business form', () => {
  it('states the no-cooling-off rule in terms', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('There is no cooling-off period');
    expect(refunds).toContain('non-refundable');
  });

  it('keeps a payment that fell due before notice was given', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('remains payable in full');
    expect(refunds).toContain('does not avoid Payment 2');
  });

  it('refunds prepayments down to the scheduled position, less fees and $250', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('paid ahead of the schedule');
    expect(refunds).toContain('$250');
    expect(refunds).toContain('non-recoverable payment-processor fees');
  });

  it('reverses cleanly when the Agency is the party leaving, at the published rate', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('$150 per hour');
    expect(refunds).toContain('written time record');
    expect(refunds).toContain('No gate-based retention applies');
  });

  it('deducts third-party costs both directions and hands the client the asset', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('whichever direction it flows');
    expect(refunds).toContain('the Client receives the asset');
  });

  it('states every settlement as two lines, one of which is always zero', () => {
    expect(section(BASE, '8.')).toContain('at least one of which is always zero');
  });

  it('never mentions consumer cancellation rights on the business form', () => {
    expect(whole(BASE)).not.toContain('Consumer Contracts Regulations');
  });
});

describe('cancellation and refunds — consumer form', () => {
  const CONSUMER = { ...BASE, isConsumer: true };

  it('carries the statutory 14-day right by name', () => {
    const refunds = section(CONSUMER, '8.');

    expect(refunds).toContain('fourteen (14) days');
    expect(refunds).toContain('Consumer Contracts Regulations 2013');
  });

  it('captures the express request to start early', () => {
    expect(section(CONSUMER, '8.')).toContain('expressly requests that the Agency begin work');
  });

  it('charges pro-rata at the published rate, never a gate-based retention', () => {
    const refunds = section(CONSUMER, '8.');

    expect(refunds).toContain('$150 per hour');
    expect(refunds).not.toContain('non-refundable');
  });

  it('uses consumer-lawful interest instead of the commercial-debts statute', () => {
    const fees = section(CONSUMER, '7.');

    expect(fees).toContain('4% per annum above the Bank of England base rate');
    expect(fees).not.toContain('Late Payment of Commercial Debts');
  });

  it('preserves Consumer Rights Act warranties instead of the AS IS disclaimer', () => {
    const warranty = section(CONSUMER, '16.');

    expect(warranty).toContain('Consumer Rights Act 2015');
    expect(warranty).not.toContain('AS IS');
  });
});

describe('the gates', () => {
  it('still requires both the cleared payment and the inputs sign-off for kickoff', () => {
    const timeline = section(BASE, '5.');

    expect(timeline).toContain('First Instalment cleared');
    expect(timeline).toContain('Inputs signed off');
    expect(timeline).toContain('neither on its own starts the clock');
  });

  it('makes Requirements Sign-off the moment scope locks', () => {
    expect(section(BASE, '5.')).toContain('closes Discovery and fixes the scope');
    expect(section(BASE, '3.')).toContain('fixed at Requirements Sign-off');
  });

  it('lets deemed acceptance trigger the second instalment, so silence cannot stall payment', () => {
    expect(section(BASE, '4.')).toContain('including the second Instalment falling due');
  });

  it('holds export while a due instalment is unpaid, but never review', () => {
    const deliverables = section(BASE, '4.');

    expect(deliverables).toContain('not available for download, export, deployment, or transfer');
    expect(deliverables).toContain('remain available to view');
  });
});

describe('availability, law, and the rest', () => {
  it('handles holidays with notice and illness without it, extending day-for-day', () => {
    const absence = section(BASE, '11.');

    expect(absence).toContain('ten (10) Business Days in advance');
    expect(absence).toContain('as soon as reasonably practicable');
    expect(absence).toContain('day-for-day');
  });

  it('credits care-plan clients pro-rata past ten consecutive business days away', () => {
    expect(section(BASE, '11.')).toContain('pro-rata credit');
  });

  it('is governed by English law in English courts, with arbitration gone', () => {
    const law = section(BASE, '20.');

    expect(law).toContain('England and Wales');
    expect(whole(BASE)).not.toMatch(/arbitrat/i);
  });

  it('uses the statutory late-payment regime for business debts', () => {
    expect(section(BASE, '7.')).toContain('Late Payment of Commercial Debts (Interest) Act 1998');
  });

  it('lets either side leave on the other\'s insolvency', () => {
    expect(section(BASE, '12.')).toContain('bankruptcy, administration, receivership, liquidation');
  });

  it('carries the Article 28 processor terms in Exhibit D', () => {
    const dpa = section(BASE, 'Exhibit D');

    expect(dpa).toContain('Article 28(3) UK GDPR');
    expect(dpa).toContain('Sub-processors');
    expect(section(BASE, '15.')).toContain('Exhibit D');
  });

  it('offers the free maintenance month for an owned testimonial, unconditioned', () => {
    const publicity = section(BASE, '21.');

    expect(publicity).toContain('one (1) additional month');
    expect(publicity).toContain('honest opinion');
    expect(publicity).toContain('no connection to reviews on any third-party platform');
  });

  it('carves out death, personal injury, and fraud from the liability cap', () => {
    expect(section(BASE, '17.')).toContain('death or personal injury');
  });
});

describe('deleted terms stay deleted', () => {
  it('carries none of the machinery the decisions removed', () => {
    const text = whole(BASE);

    expect(text).not.toContain('Termination Settlement');
    expect(text).not.toContain('accelerat');
    expect(text).not.toContain('estimated total Project hours');
    expect(text).not.toContain('Cancellation Rate');
    expect(text).not.toContain('testimonial about working with the Agency');
  });

  it('exposes the agency rate as $150/hr for reuse by the rest of the system', () => {
    expect(AGENCY_RATE_CENTS).toBe(15_000);
  });
});

describe('the rendered document', () => {
  it('renders to a PDF of at least ten pages with every conditional clause on', async () => {
    const sections = buildContractSections({
      ...BASE,
      addOnKeys: ['seo', 'ecommerce', 'subscriptions', 'custom-backend', 'maintenance'],
      addOnLabels: ['SEO', 'E-commerce', 'Subscriptions', 'Custom Backend', 'Maintenance'],
    });
    const bytes = await buildContractPdf({
      company: BASE.company,
      contactName: BASE.contactName,
      serviceLabel: BASE.serviceLabel,
      addOnLabels: ['SEO', 'E-commerce'],
      timelineLabel: BASE.timelineLabel,
      basePrice: BASE.basePrice,
      addOnsPrice: BASE.addOnsPrice,
      totalPrice: BASE.totalPrice,
      depositAmount: '$8,000',
      sections,
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(10);
  });

  it('renders the plain contract to at least ten pages too — the floor holds without add-ons', async () => {
    const bytes = await buildContractPdf({
      company: BASE.company,
      contactName: BASE.contactName,
      serviceLabel: BASE.serviceLabel,
      addOnLabels: [],
      timelineLabel: BASE.timelineLabel,
      basePrice: BASE.basePrice,
      addOnsPrice: '$0',
      totalPrice: BASE.totalPrice,
      depositAmount: '$8,000',
      sections: buildContractSections({ ...BASE, addOnKeys: [], addOnLabels: [] }),
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(10);
  });
});
