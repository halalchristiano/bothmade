import { gateReached } from '@/lib/billing';
import { settlement, type SettlementLine, type Settlement } from '@/lib/invoice-lifecycle';

/**
 * What a client is actually owed if the project ended today.
 *
 * Section 8 of the contract answers this precisely, and until now the only
 * way to get the answer was to read four hundred words of it, work out which
 * gates had been passed, and do the arithmetic by hand — every time, under
 * the kind of pressure that produces a number nobody checks. The refund
 * screen asked for an amount and offered no help arriving at one.
 *
 * The rules, and where each comes from:
 *
 *   8(a) "each Instalment is tied to a gate the Client has already passed —
 *         signing, Design Approval, Ready for Launch — so every Instalment
 *         paid has been earned by the work behind its gate, is
 *         non-refundable"
 *
 *   8(b) "An Instalment or other Fee that fell due before the Client's notice
 *         was given remains payable in full."
 *
 *   8(d) "the Agency retains what the schedule in Section 7 would have
 *         entitled it to at the point notice was given, and refunds the
 *         remainder, less any non-recoverable payment-processor fees on the
 *         refunded amount and a fixed administration charge"
 *
 *   8(g) "the position reverses: the Agency retains only the value of time
 *         actually worked on the Project at the Agency Rate ... No gate-based
 *         retention applies — the Agency does not keep money tied to gates
 *         when the Agency is the reason later gates will never be reached."
 *
 * Which means the entire question turns on two things: who is ending it, and
 * which gates have been passed. Everything else follows.
 *
 * The consumer form of Section 8 is a different document, so it is a
 * different branch here rather than an adjustment to this one. Its (d) caps
 * the Agency's retention at "the value of time worked ... never more than the
 * amounts the schedule in Section 7 had made due", which is the business
 * rule and the time rule, whichever is smaller.
 */

/** Who is ending the project. It changes the answer more than anything else does. */
export type RefundScenario = 'client-cancels' | 'agency-ends';

export function isRefundScenario(value: unknown): value is RefundScenario {
  return value === 'client-cancels' || value === 'agency-ends';
}

export interface EntitlementInstalment {
  index: number;
  label: string;
  amountCents: number;
  trigger: string;
  status: string;
}

/** One row of the stage-by-stage picture: has this gate been passed, and was it paid? */
export interface StageRow {
  index: number;
  label: string;
  amountCents: number;
  trigger: string;
  triggerLabel: string;
  /** True once the work behind this payment has been done, per Section 8(a). */
  gatePassed: boolean;
  paid: boolean;
  /** True when this row's money is money the studio keeps. */
  earned: boolean;
}

export const TRIGGER_LABELS: Record<string, string> = {
  signing: 'On signing',
  'design-approval': 'On design approval',
  'ready-for-launch': 'When ready to launch',
};

export interface EntitlementInput {
  scenario: RefundScenario;
  /** The consumer form of Section 8 is a different clause, not a variation. */
  consumer: boolean;
  statusStage: number;
  totalPrice: number;
  paidCents: number;
  instalments: EntitlementInstalment[];
  /** Hours actually worked. Required by 8(g), and by both consumer branches. */
  hoursWorked?: number;
  agencyRateCents: number;
  adminFeeCents: number;
  /** Non-recoverable third-party costs under 8(f) — "itemized in writing". */
  thirdPartyCosts?: SettlementLine[];
  /** Processor fees on the refunded amount, 8(d). */
  processorFeeCents?: number;
}

export interface Entitlement {
  stages: StageRow[];
  /** What the schedule alone says the studio has earned at this point. */
  gateEarnedCents: number;
  /** What the time record alone says it has earned. */
  timeEarnedCents: number;
  /** The one that actually applies, given the scenario and the client type. */
  agencyKeepsCents: number;
  /** Which clause decided it, in words, for the person reading the screen. */
  basis: string;
  clause: string;
  paidCents: number;
  /** Money paid beyond what the studio has earned — the refundable pot. */
  refundableCents: number;
  deductions: SettlementLine[];
  settlement: Settlement;
  /** True when the time record is load-bearing and hasn't been supplied. */
  needsHours: boolean;
  /** Anything the arithmetic can't decide and a person has to. */
  cautions: string[];
}

export function refundEntitlement(input: EntitlementInput): Entitlement {
  const live = input.instalments.filter((i) => i.status !== 'void');

  const stages: StageRow[] = live.map((inst) => {
    const gatePassed = gateReached(inst.trigger, input.statusStage);
    return {
      index: inst.index,
      label: inst.label,
      amountCents: inst.amountCents,
      trigger: inst.trigger,
      triggerLabel: TRIGGER_LABELS[inst.trigger] ?? inst.trigger,
      gatePassed,
      paid: inst.status === 'paid',
      // 8(a): the money behind a passed gate is earned whether or not it has
      // been collected yet. 8(b) then keeps the uncollected part payable.
      earned: gatePassed,
    };
  });

  const gateEarnedCents = stages.filter((s) => s.earned).reduce((sum, s) => sum + s.amountCents, 0);

  const hours = typeof input.hoursWorked === 'number' && input.hoursWorked > 0 ? input.hoursWorked : 0;
  const timeEarnedCents = Math.round(hours * input.agencyRateCents);

  const cautions: string[] = [];
  let agencyKeepsCents: number;
  let basis: string;
  let clause: string;
  let needsHours = false;

  if (input.scenario === 'agency-ends') {
    // 8(g) business / 8(f) consumer. Identical in effect: no gate retention.
    agencyKeepsCents = timeEarnedCents;
    basis = 'Time actually worked, at the Agency Rate. No gate-based retention applies.';
    clause = input.consumer ? '8(f)' : '8(g)';
    needsHours = hours === 0;
    cautions.push('The contract requires the written time record to be given to the client with this.');
  } else if (input.consumer) {
    // Consumer 8(d): time worked, "never more than the amounts the schedule
    // in Section 7 had made due". Both caps apply, so the smaller wins.
    agencyKeepsCents = Math.min(timeEarnedCents, gateEarnedCents);
    basis =
      'Time worked at the Agency Rate, capped at what the schedule had already made due — whichever is lower.';
    clause = '8(d)';
    needsHours = hours === 0;
    cautions.push(
      'If they are still inside the 14-day cancellation period, 8(c) applies instead: the deduction is time worked, capped at the share of the fee proportionate to the work done. That proportion is a judgement, not a calculation — set the amount by hand.'
    );
  } else {
    // The ordinary case. 8(a)+(d): gates decide it.
    agencyKeepsCents = gateEarnedCents;
    basis = 'Every payment whose gate has been passed is earned and non-refundable.';
    clause = '8(a), 8(d)';
  }

  const refundableCents = Math.max(0, input.paidCents - agencyKeepsCents);

  // Deductions apply only to money going back, and the administration charge
  // only where the client is the one ending it — 8(g) reverses the position,
  // and charging an admin fee for our own withdrawal would be absurd.
  const deductions: SettlementLine[] = [];
  if (refundableCents > 0) {
    if (input.scenario === 'client-cancels' && input.adminFeeCents > 0) {
      deductions.push({ label: 'Administration charge', amountCents: input.adminFeeCents });
    }
    if (input.processorFeeCents && input.processorFeeCents > 0) {
      deductions.push({ label: 'Non-recoverable processor fees', amountCents: input.processorFeeCents });
    }
    for (const cost of input.thirdPartyCosts ?? []) {
      if (cost.amountCents > 0) deductions.push(cost);
    }
  }

  // Where the studio has earned more than has been paid, the difference is
  // money still owed — 8(b), an instalment that fell due survives the notice.
  // The two-line settlement already has somewhere to put it.
  const owedByClient = Math.max(0, agencyKeepsCents - input.paidCents);
  const result = settlement({ refundCents: refundableCents, deductions });
  const finalSettlement: Settlement =
    owedByClient > 0
      ? {
          ...result,
          dueFromClientCents: owedByClient,
          returnedToClientCents: 0,
          lines: [
            { label: 'Amount due from the Client', amountCents: owedByClient },
            { label: 'Amount returned to the Client', amountCents: 0 },
          ],
        }
      : result;

  if (input.paidCents === 0 && agencyKeepsCents === 0) {
    cautions.push('Nothing has been paid and nothing has been earned — there is nothing to settle.');
  }

  return {
    stages,
    gateEarnedCents,
    timeEarnedCents,
    agencyKeepsCents,
    basis,
    clause,
    paidCents: input.paidCents,
    refundableCents,
    deductions,
    settlement: finalSettlement,
    needsHours,
    cautions,
  };
}
