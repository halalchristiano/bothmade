import { describe, expect, it } from 'vitest';
import { buildContractSections, type ContractParams } from '@/lib/contract-terms';

/**
 * The termination schedule is the one part of the contract that is arithmetic
 * rather than prose, and it is the part a client reads hardest — at the exact
 * moment they have decided to leave. A percentage that renders as the wrong
 * dollar figure is not a typo, it is a number someone will be asked to pay.
 *
 * So these tests care about two things: that the figures printed into the
 * contract are the ones the schedule actually means, and that the clauses
 * conditioned on a bargain the Client struck — the testimonial discount —
 * stay out of contracts where no such bargain exists.
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
  depositAmount: '$10,000',
  balanceAmount: '$10,000',
  depositPercent: 50,
  effectiveDate: 'August 4, 2026',
  totalPriceCents: 2_000_000,
};

function section(p: ContractParams, startsWith: string) {
  const found = buildContractSections(p).find((s) => s.heading.startsWith(startsWith));
  if (!found) throw new Error(`No section starting "${startsWith}"`);
  return found.paragraphs.join('\n');
}

describe('termination settlement schedule', () => {
  it('prints each tier as money, not as homework for the client', () => {
    const refunds = section(BASE, '8.');

    // 25 / 50 / 62.5 / 100 percent of a $20,000 engagement.
    expect(refunds).toContain('$5,000');
    expect(refunds).toContain('$10,000');
    expect(refunds).toContain('$12,500');
    expect(refunds).toContain('$20,000');
  });

  it('renders 62.5% without dropping the half, and whole numbers without a decimal', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('62.5% of the Total Fee');
    expect(refunds).toContain('25% of the Total Fee');
    expect(refunds).not.toContain('25.0%');
  });

  it('scales the figures to the actual deal rather than a template price', () => {
    const smaller = section({ ...BASE, totalPriceCents: 800_000, totalPrice: '$8,000' }, '8.');

    expect(smaller).toContain('$2,000'); // 25%
    expect(smaller).toContain('$5,000'); // 62.5%
    expect(smaller).not.toContain('$12,500');
  });

  it('caps the client at the Total Fee, so leaving never costs more than finishing', () => {
    expect(section(BASE, '8.')).toContain('never require the Client to pay more than the Total Fee');
  });

  it('drops the cancellation element when the Agency is the one walking away', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('no cancellation element is retained');
  });

  it('states the pre-estimate rationale the schedule needs to read as damages, not a penalty', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('genuine pre-estimate');
    expect(refunds).toContain('rather than a punishment');
  });

  it('fixes the stage at the notice date, so the notice period cannot inflate the bill', () => {
    expect(section(BASE, '11.')).toContain('not the date the notice period expires');
  });

  it('works the numbers through in Exhibit C using the same figures', () => {
    const exhibit = section(BASE, 'Exhibit C');

    expect(exhibit).toContain('cancelled mid-Build');
    expect(exhibit).toContain('$12,500');
    expect(exhibit).toContain('a further $2,500');
  });
});

describe('kickoff date', () => {
  it('requires both the cleared deposit and written sign-off on inputs', () => {
    const timeline = section(BASE, '5.');

    expect(timeline).toContain('Deposit cleared');
    expect(timeline).toContain('Inputs signed off');
    expect(timeline).toContain('the later of');
    expect(timeline).toContain('neither on its own starts the clock');
  });
});

describe('preview environment', () => {
  it('names the assigned subdomain when there is one', () => {
    const withDomain = section({ ...BASE, previewDomain: 'northgate.bothmade.com' }, '4.');

    expect(withDomain).toContain('northgate.bothmade.com');
  });

  it('falls back to describing the subdomain when none is assigned yet', () => {
    const deliverables = section(BASE, '4.');

    expect(deliverables).toContain('subdomain of a domain the Agency controls');
    expect(deliverables).not.toContain('undefined');
  });

  it('keeps the review clock running even while export is held', () => {
    expect(section(BASE, '4.')).toContain('whether or not the Client is entitled to download or export');
  });
});

describe('testimonial discount', () => {
  it('stays out of a contract where no such discount was agreed', () => {
    const headings = buildContractSections(BASE).map((s) => s.heading);

    expect(headings).not.toContain('Testimonial Discount and Export Condition');
  });

  it('holds export — not review — once the discount is taken', () => {
    const clause = section({ ...BASE, reviewDiscount: true }, 'Testimonial Discount');

    expect(clause).toContain('not available for download, export, or deployment');
    expect(clause).toContain('Review access is not withheld');
  });

  it('conditions the discount on an honest testimonial, never on a favourable one', () => {
    const clause = section({ ...BASE, reviewDiscount: true }, 'Testimonial Discount');

    expect(clause).toContain('does not require it to be favorable');
    expect(clause).toContain('regardless of its content');
  });

  it('leaves the client a way out that is not writing a testimonial', () => {
    const clause = section({ ...BASE, reviewDiscount: true }, 'Testimonial Discount');

    expect(clause).toContain('pay the undiscounted price');
  });
});

describe('cross-references', () => {
  it('points Section 10 at the renumbered agency-delay clause', () => {
    expect(section(BASE, '10.')).toContain('Section 8(g)');
  });

  it('leaves no reference to the lettering the refund section used to have', () => {
    const whole = buildContractSections(BASE)
      .flatMap((s) => s.paragraphs)
      .join('\n');

    // (d) was agency delay and (f) was chargebacks before the rewrite; both
    // moved, and a stale pointer would send a client to the wrong clause.
    expect(whole).not.toContain('Section 8(d)');
    expect(whole).not.toContain('Section 8(f)');
  });
});
