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

/**
 * Which invoices the refundable money actually sits on.
 *
 * The entitlement above is a fact about the *project*: "they are owed
 * $11,750." Refunds are not — every refund goes against one invoice, through
 * one payment, back to one card. Those two facts do not line up on their own,
 * and treating the entitlement as if it were a per-invoice figure is how the
 * same $11,750 gets refunded off two different invoices and $23,500 leaves
 * the account.
 *
 * So the pot is allocated across the invoices that can actually carry it,
 * oldest first, and each one is capped twice: at what is left on that invoice,
 * and at what is left of the entitlement. Refund every line here and the total
 * is the entitlement exactly — no more, and never twice.
 *
 * Oldest first because a refund follows the money back the way it came, and
 * the earliest payment is the one most likely to still be inside the window
 * the card network will accept a refund through.
 */
export interface RefundableInvoice {
  id: string;
  number: string;
  description: string;
  amountCents: number;
  refundedCents: number;
  createdAt: string | Date;
  /** What is left on this invoice, ignoring the entitlement. */
  remainingCents: number;
  /** What may actually be refunded here, once the entitlement is shared out. */
  allocatedCents: number;
}

export interface AllocationInput {
  id: string;
  number: string;
  description: string;
  amountCents: number;
  refundedCents: number;
  status: string;
  createdAt: string | Date;
}

export interface Allocation {
  invoices: RefundableInvoice[];
  /** Entitlement with nowhere to go — see below. */
  unallocatedCents: number;
}

export function allocateRefund(
  invoices: AllocationInput[],
  returnedToClientCents: number
): Allocation {
  // Only a paid invoice with something left on it can carry a refund. An open
  // one was never paid; a void one is not money.
  const eligible = invoices
    .filter((inv) => inv.status === 'paid' && inv.amountCents - inv.refundedCents > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let left = Math.max(0, returnedToClientCents);
  const out: RefundableInvoice[] = eligible.map((inv) => {
    const remainingCents = inv.amountCents - inv.refundedCents;
    const allocatedCents = Math.min(remainingCents, left);
    left -= allocatedCents;
    return {
      id: inv.id,
      number: inv.number,
      description: inv.description,
      amountCents: inv.amountCents,
      refundedCents: inv.refundedCents,
      createdAt: inv.createdAt,
      remainingCents,
      allocatedCents,
    };
  });

  return {
    // Rows that got nothing are noise on a screen about giving money back.
    invoices: out.filter((inv) => inv.allocatedCents > 0),
    /**
     * Money owed with no invoice to refund it against.
     *
     * Real, and worth naming rather than rounding away: the deposit taken at
     * signing predates the invoice ledger on older projects, and a payment
     * recorded by hand has no invoice at all. The money is still owed — it
     * just has to go back another way, and somebody needs to be told that
     * rather than left wondering why the numbers disagree.
     */
    unallocatedCents: left,
  };
}

/**
 * The settlement in a sentence, built from what actually happened on this
 * project rather than from a template.
 *
 * The distinction matters more than it looks. A stock paragraph under a
 * specific number reads as an explanation of that number, gets trusted like
 * one, and is wrong the moment the situation is not the common case — which
 * is exactly when somebody is reading it. So every clause of this is derived:
 * the stage names come from the schedule, the figures from the arithmetic
 * above, and the sentence changes shape when the answer does.
 */
export function explainEntitlement(input: {
  entitlement: Entitlement;
  scenario: RefundScenario;
  consumer: boolean;
  company: string;
  hoursWorked?: number;
  agencyRateCents: number;
}): string[] {
  const { entitlement: e } = input;
  const money = (cents: number) =>
    (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const paras: string[] = [];

  const passed = e.stages.filter((s) => s.gatePassed);
  const notPassed = e.stages.filter((s) => !s.gatePassed);

  // 1. What has been earned, and why.
  if (input.scenario === 'agency-ends') {
    const hours = input.hoursWorked ?? 0;
    paras.push(
      `Because ${input.consumer ? 'we' : 'we'} would be the ones ending this, the payment gates stop mattering. The contract says we keep only what the time record supports — ${hours} hour${hours === 1 ? '' : 's'} at ${money(input.agencyRateCents)} an hour, which is ${money(e.timeEarnedCents)} — no matter how much of the work had been signed off.`
    );
  } else if (input.consumer) {
    const capped = e.gateEarnedCents < e.timeEarnedCents;
    paras.push(
      `${input.company} is on consumer terms, so we keep whichever is lower: the time actually worked (${money(e.timeEarnedCents)}) or what the schedule had already made due (${money(e.gateEarnedCents)}). ${capped ? 'The schedule is lower here, so that is the figure.' : 'The time record is lower here, so that is the figure.'}`
    );
  } else if (passed.length === 0) {
    paras.push(
      'No payment gate has been passed yet, so nothing has been earned. Everything paid so far is refundable.'
    );
  } else {
    const names = passed.map((s) => s.label).join(' and ');
    paras.push(
      `${names} ${passed.length === 1 ? 'has' : 'have'} passed ${passed.length === 1 ? 'its' : 'their'} gate, so that work is done and that money is earned — ${money(e.gateEarnedCents)} in total. The contract treats each payment as bought and paid for by the work behind it, which is why it does not come back.`
    );
    if (notPassed.length > 0) {
      paras.push(
        `${notPassed.map((s) => s.label).join(' and ')} ${notPassed.length === 1 ? 'has' : 'have'} not been reached. That work was never delivered, so it is never charged for — and anything already paid against ${notPassed.length === 1 ? 'it' : 'them'} goes back.`
      );
    }
  }

  // 2. Which way the money is actually moving.
  if (e.settlement.dueFromClientCents > 0) {
    paras.push(
      `This is not a refund. ${input.company} has paid ${money(e.paidCents)} against ${money(e.agencyKeepsCents)} of earned work, so they owe ${money(e.settlement.dueFromClientCents)}. A payment that fell due before they gave notice stays payable — ending the project does not erase a debt that had already crystallised.`
    );
  } else if (e.settlement.returnedToClientCents === 0 && e.paidCents > 0) {
    paras.push(
      `They have paid exactly what has been earned, so nothing moves in either direction. There is nothing to refund and nothing to invoice.`
    );
  } else if (e.settlement.returnedToClientCents > 0) {
    const deducted = e.refundableCents - e.settlement.returnedToClientCents;
    paras.push(
      deducted > 0
        ? `They have paid ${money(e.paidCents)} and ${money(e.agencyKeepsCents)} of that is earned, leaving ${money(e.refundableCents)}. Less ${money(deducted)} withheld — itemised above — ${money(e.settlement.returnedToClientCents)} goes back to them.`
        : `They have paid ${money(e.paidCents)} and ${money(e.agencyKeepsCents)} of that is earned, so ${money(e.settlement.returnedToClientCents)} goes back to them.`
    );
  }

  return paras;
}
