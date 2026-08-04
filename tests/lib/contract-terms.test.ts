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

describe('cancellation inside the 14-day window', () => {
  it('states the flat deduction as money, not as a percentage to work out', () => {
    // 30% of $20,000.
    expect(section(BASE, '8.')).toContain('$6,000');
  });

  it('derives the hourly rate from the fee and the estimated hours, to the cent', () => {
    // $20,000 over 160 hours.
    expect(section(BASE, '8.')).toContain('$125.00 per hour');
  });

  it('keeps the cents on a rate that does not divide evenly', () => {
    // $23,500 over 160 hours is $146.875 — the rounding has to survive.
    const odd = section({ ...BASE, totalPriceCents: 2_350_000, totalPrice: '$23,500' }, '8.');

    expect(odd).toContain('$146.88 per hour');
  });

  it('falls back to the documented hour estimate when none was recorded', () => {
    expect(section(BASE, '8.')).toContain('160 estimated hours');
  });

  it('uses the recorded estimate where there is one, and reprices the hour', () => {
    const scoped = section({ ...BASE, estimatedHours: 250 }, '8.');

    expect(scoped).toContain('250 estimated hours');
    expect(scoped).toContain('$80.00 per hour');
  });

  it('deducts the greater of the two legs, not the sum', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('less the greater of');
    expect(refunds).not.toContain('plus thirty percent');
  });

  it('never turns a refund into a debt', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('No refund will exceed the amount actually paid');
    expect(refunds).toContain('does not create a debt');
  });
});

describe('cancellation after the window', () => {
  it('earns the upfront payment outright and calls the balance due', () => {
    const refunds = section(BASE, '8.');

    expect(refunds).toContain('fully earned and non-refundable');
    expect(refunds).toContain('becomes due according to the payment terms');
  });

  it('runs the window from the Project Start Date, which is the Kickoff Date', () => {
    expect(section(BASE, '1.')).toContain('"Project Start Date"');
    expect(section(BASE, '8.')).toContain('calendar days following the Project Start Date');
  });

  it('fixes the side of the window by the notice date, not the notice expiry', () => {
    expect(section(BASE, '11.')).toContain('not the date the notice period expires');
  });
});

describe('the worked examples', () => {
  it('shows the flat leg winning when little time has gone in', () => {
    const exhibit = section(BASE, 'Exhibit C');

    // 40 hours at $125 is $5,000, under the $6,000 floor, so $10,000 - $6,000.
    expect(exhibit).toContain('40 hours');
    expect(exhibit).toContain('refunded $4,000');
  });

  it('shows the hourly leg taking over once real work has gone in', () => {
    const exhibit = section(BASE, 'Exhibit C');

    // 80 hours at $125 is $10,000, over the floor, so the deposit is consumed.
    expect(exhibit).toContain('80 hours');
    expect(exhibit).toContain('refunded $0');
  });

  it('names the crossover so nobody has to derive it mid-argument', () => {
    expect(section(BASE, 'Exhibit C')).toContain('at 48 hours');
  });

  it('drops the flat deduction when the Agency is the one walking away', () => {
    expect(section(BASE, '8.')).toContain('no deduction under (b)(1) applies');
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
    expect(section(BASE, '10.')).toContain('Section 8(i)');
  });

  it('leaves no reference to the lettering the refund section used to have', () => {
    const whole = buildContractSections(BASE)
      .flatMap((s) => s.paragraphs)
      .join('\n');

    // The refund section has been relettered twice. A pointer at the old
    // lettering would send a client to a clause about something else.
    expect(whole).not.toContain('Section 8(e)');
    expect(whole).not.toContain('Section 8(f)');
    expect(whole).not.toContain('Termination Settlement');
  });
});
