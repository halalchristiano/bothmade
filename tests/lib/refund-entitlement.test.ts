import { describe, expect, it } from 'vitest';
import { refundEntitlement, type EntitlementInstalment } from '@/lib/refund-entitlement';

/**
 * Section 8, as arithmetic. Every case names the clause it comes from,
 * because the answer to "why is that the number" is never in the code — and
 * the whole point of this module is that nobody should have to re-derive it
 * from four hundred words under pressure.
 *
 * The worked examples in the contract itself (Exhibit "How this plays out")
 * are reproduced here on purpose: if the code and the document a client
 * signed ever disagree, these are what catch it.
 */

const RATE = 15_000; // $150/hr — AGENCY_RATE_CENTS
const ADMIN = 25_000; // $250 — PREPAYMENT_ADMIN_FEE_CENTS

// $20,000 at 40/30/30.
const schedule: EntitlementInstalment[] = [
  { index: 1, label: 'Payment 1 of 3', amountCents: 800_000, trigger: 'signing', status: 'paid' },
  { index: 2, label: 'Payment 2 of 3', amountCents: 600_000, trigger: 'design-approval', status: 'scheduled' },
  { index: 3, label: 'Payment 3 of 3', amountCents: 600_000, trigger: 'ready-for-launch', status: 'scheduled' },
];

const base = {
  consumer: false,
  totalPrice: 2_000_000,
  instalments: schedule,
  agencyRateCents: RATE,
  adminFeeCents: ADMIN,
};

describe('the ordinary case: the client cancels', () => {
  /**
   * 8(a): "every Instalment paid has been earned by the work behind its gate,
   * is non-refundable, and nothing further is owed."
   */
  it('keeps everything when they have paid exactly what the gates entitled us to', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'client-cancels',
      statusStage: 1, // Design — only the signing gate has passed
      paidCents: 800_000,
    });

    expect(result.agencyKeepsCents).toBe(800_000);
    expect(result.refundableCents).toBe(0);
    expect(result.settlement.returnedToClientCents).toBe(0);
    expect(result.settlement.dueFromClientCents).toBe(0);
  });

  /**
   * The contract's own worked example: "Prepaid in full, cancelled early: the
   * Client paid the whole $20,000 at signing and cancels before Design
   * Approval. The schedule entitled the Agency to $8,000 at that point, so the
   * Client is refunded $12,000, less non-recoverable processor fees on the
   * refund and the $250 administration charge."
   */
  it('reproduces the contract\'s own prepayment example', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'client-cancels',
      statusStage: 1,
      paidCents: 2_000_000,
    });

    expect(result.agencyKeepsCents).toBe(800_000);
    expect(result.refundableCents).toBe(1_200_000);
    // $12,000 less the $250 administration charge.
    expect(result.settlement.returnedToClientCents).toBe(1_175_000);
    expect(result.deductions.map((d) => d.label)).toContain('Administration charge');
  });

  /** 8(a) again, one gate later — design approved means Payment 2 is earned. */
  it('earns the next payment once its gate is passed, paid or not', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'client-cancels',
      statusStage: 2, // Build — design approval has happened
      paidCents: 2_000_000,
    });

    expect(result.gateEarnedCents).toBe(1_400_000);
    expect(result.refundableCents).toBe(600_000);
  });

  /**
   * 8(b): "An Instalment or other Fee that fell due before the Client's notice
   * was given remains payable in full." So the settlement flips: this is not a
   * refund at all, it is an invoice.
   */
  it('turns into money owed when the gates outrun what has been paid', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'client-cancels',
      statusStage: 2, // $14,000 earned
      paidCents: 800_000, // only $8,000 collected
    });

    expect(result.settlement.dueFromClientCents).toBe(600_000);
    expect(result.settlement.returnedToClientCents).toBe(0);
    expect(result.settlement.lines.some((l) => l.amountCents === 0)).toBe(true);
  });

  it('itemises third-party costs on top of the administration charge', () => {
    // 8(f): non-recoverable third-party costs, "itemized in writing".
    const result = refundEntitlement({
      ...base,
      scenario: 'client-cancels',
      statusStage: 1,
      paidCents: 2_000_000,
      processorFeeCents: 4_500,
      thirdPartyCosts: [{ label: 'Domain registration', amountCents: 1_800 }],
    });

    expect(result.deductions.map((d) => d.label)).toEqual([
      'Administration charge',
      'Non-recoverable processor fees',
      'Domain registration',
    ]);
    expect(result.settlement.returnedToClientCents).toBe(1_200_000 - 25_000 - 4_500 - 1_800);
  });

  it('deducts nothing when there is nothing going back', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'client-cancels',
      statusStage: 1,
      paidCents: 800_000,
      processorFeeCents: 4_500,
    });

    expect(result.deductions).toEqual([]);
  });
});

describe('when we are the ones leaving', () => {
  /**
   * 8(g): "the position reverses: the Agency retains only the value of time
   * actually worked ... No gate-based retention applies — the Agency does not
   * keep money tied to gates when the Agency is the reason later gates will
   * never be reached."
   *
   * The contract's worked example: "$8,000 paid and 20 hours worked. It keeps
   * 20 × the Agency Rate = $3,000 ... and refunds $5,000."
   */
  it('reproduces the contract\'s own agency-terminates example', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'agency-ends',
      statusStage: 1,
      paidCents: 800_000,
      hoursWorked: 20,
    });

    expect(result.agencyKeepsCents).toBe(300_000);
    expect(result.refundableCents).toBe(500_000);
    expect(result.clause).toBe('8(g)');
  });

  it('ignores the gates entirely, however many have been passed', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'agency-ends',
      statusStage: 4, // every gate passed
      paidCents: 2_000_000,
      hoursWorked: 20,
    });

    expect(result.gateEarnedCents).toBe(2_000_000);
    expect(result.agencyKeepsCents).toBe(300_000);
  });

  /**
   * No administration charge when we are the party withdrawing. Charging one
   * for our own exit is not something 8(g) contemplates.
   */
  it('charges no administration fee for our own withdrawal', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'agency-ends',
      statusStage: 1,
      paidCents: 800_000,
      hoursWorked: 10,
    });

    expect(result.deductions.map((d) => d.label)).not.toContain('Administration charge');
  });

  it('says when the time record is missing rather than reporting zero as an answer', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'agency-ends',
      statusStage: 1,
      paidCents: 800_000,
    });

    expect(result.needsHours).toBe(true);
    expect(result.cautions.join(' ')).toMatch(/time record/i);
  });
});

describe('the consumer form', () => {
  /**
   * Consumer 8(d): the Agency retains "the value of time worked at the Agency
   * Rate ... never more than the amounts the schedule in Section 7 had made
   * due". Two caps, and the smaller one wins.
   */
  it('takes the lower of time worked and what the schedule had made due', () => {
    // 20 hours = $3,000; the signing gate alone had made $8,000 due.
    const timeIsLower = refundEntitlement({
      ...base,
      consumer: true,
      scenario: 'client-cancels',
      statusStage: 1,
      paidCents: 2_000_000,
      hoursWorked: 20,
    });
    expect(timeIsLower.agencyKeepsCents).toBe(300_000);

    // 100 hours = $15,000, but only $8,000 had fallen due.
    const scheduleIsLower = refundEntitlement({
      ...base,
      consumer: true,
      scenario: 'client-cancels',
      statusStage: 1,
      paidCents: 2_000_000,
      hoursWorked: 100,
    });
    expect(scheduleIsLower.agencyKeepsCents).toBe(800_000);
  });

  /**
   * 8(c)'s proportionate cap is a judgement about how much of the work is
   * done, not something derivable from a stage number. Saying so is the
   * honest answer; inventing a percentage would not be.
   */
  it('flags the 14-day window rather than guessing at the proportionate cap', () => {
    const result = refundEntitlement({
      ...base,
      consumer: true,
      scenario: 'client-cancels',
      statusStage: 1,
      paidCents: 2_000_000,
      hoursWorked: 20,
    });

    expect(result.cautions.join(' ')).toMatch(/14-day/);
    expect(result.cautions.join(' ')).toMatch(/judgement/i);
  });

  it('still reverses the position when we are the ones leaving', () => {
    const result = refundEntitlement({
      ...base,
      consumer: true,
      scenario: 'agency-ends',
      statusStage: 4,
      paidCents: 2_000_000,
      hoursWorked: 20,
    });

    expect(result.agencyKeepsCents).toBe(300_000);
    expect(result.clause).toBe('8(f)');
  });
});

describe('the stage-by-stage picture', () => {
  it('marks which gates have been passed and which payments landed', () => {
    const result = refundEntitlement({
      ...base,
      scenario: 'client-cancels',
      statusStage: 2,
      paidCents: 800_000,
    });

    expect(result.stages.map((s) => [s.label, s.gatePassed, s.paid])).toEqual([
      ['Payment 1 of 3', true, true],
      ['Payment 2 of 3', true, false],
      ['Payment 3 of 3', false, false],
    ]);
  });

  it('names each gate in the contract\'s own words', () => {
    const result = refundEntitlement({ ...base, scenario: 'client-cancels', statusStage: 0, paidCents: 0 });

    expect(result.stages.map((s) => s.triggerLabel)).toEqual([
      'On signing',
      'On design approval',
      'When ready to launch',
    ]);
  });

  it('ignores voided rows', () => {
    const result = refundEntitlement({
      ...base,
      instalments: [...schedule, { index: 4, label: 'Cancelled', amountCents: 999, trigger: 'signing', status: 'void' }],
      scenario: 'client-cancels',
      statusStage: 0,
      paidCents: 0,
    });

    expect(result.stages).toHaveLength(3);
  });

  it('says plainly when there is nothing to settle at all', () => {
    const result = refundEntitlement({
      ...base,
      instalments: [],
      scenario: 'client-cancels',
      statusStage: 0,
      paidCents: 0,
    });

    expect(result.cautions.join(' ')).toMatch(/nothing to settle/i);
  });
});
