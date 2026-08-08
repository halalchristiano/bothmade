import { describe, expect, it } from 'vitest';
import { gateReached, projectBalance } from '@/lib/billing';
import { uninvoicedPayments } from '@/lib/stage-gates';

/**
 * Confirming a project Ready for Launch is what makes Payment 3 due.
 *
 * Section 1 defines the phrase as a state the Agency "has confirmed in
 * writing through the dashboard", and Section 7 makes that confirmation the
 * trigger for the third instalment. The launch board has a button for it, it
 * stamps `readyForLaunchAt`, and it writes "Ready for launch" onto the
 * client's own timeline saying the final invoice follows.
 *
 * gateReached() read the stage dropdown and nothing else, so the system
 * contradicted itself out loud: the studio confirms readiness in the place
 * the contract names, tells the client the invoice is coming, and then the
 * one route that bills Payment 3 refuses it as a milestone that has not
 * happened yet. Priorities agreed with the refusal — the money sat in
 * `gated`, which is the bucket for "not owed", so nothing surfaced it either.
 *
 * Design Approval had the same hole and was half-patched: uninvoicedPayments()
 * carried a private exception for `designApprovedAt` that no other caller
 * knew about, so a deemed approval under Section 4 opened the gate on one
 * dashboard panel and nowhere else. Both records belong in gateReached().
 */

const scheduled = (trigger: string, amountCents = 200_000) => ({
  id: `i-${trigger}`,
  index: trigger === 'design-approval' ? 2 : 3,
  label: trigger === 'design-approval' ? 'Payment 2 of 3' : 'Payment 3 of 3',
  amountCents,
  trigger,
  status: 'scheduled',
});

describe('gateReached, on the stage alone', () => {
  it('still opens the launch gate at Launch', () => {
    expect(gateReached('ready-for-launch', 3)).toBe(true);
  });

  it('still holds it shut at Build with nothing recorded', () => {
    expect(gateReached('ready-for-launch', 2)).toBe(false);
  });

  it('never holds the signing payment, at any stage', () => {
    expect(gateReached('signing', 0)).toBe(true);
  });
});

describe('gateReached, once the moment is on the record', () => {
  /**
   * The bug, in one line. The project is still sitting at Build because
   * nobody moved the dropdown — moving it is a separate act that emails the
   * client — but the confirmation Section 1 actually defines has been made.
   */
  it('opens the launch gate on a written confirmation, whatever the stage says', () => {
    expect(
      gateReached('ready-for-launch', 2, { readyForLaunchAt: new Date('2026-08-01') })
    ).toBe(true);
  });

  it('opens the design gate on a recorded approval, whatever the stage says', () => {
    expect(
      gateReached('design-approval', 1, { designApprovedAt: new Date('2026-08-01') })
    ).toBe(true);
  });

  /** One record must not open the other's gate. */
  it('does not let a launch confirmation stand in for design approval', () => {
    expect(gateReached('design-approval', 1, { readyForLaunchAt: new Date() })).toBe(false);
  });

  it('does not let a design approval stand in for a launch confirmation', () => {
    expect(gateReached('ready-for-launch', 2, { designApprovedAt: new Date() })).toBe(false);
  });

  it('treats a null stamp as nothing having happened', () => {
    expect(gateReached('ready-for-launch', 2, { readyForLaunchAt: null })).toBe(false);
  });
});

describe('what the priorities list is told about that money', () => {
  const base = {
    totalPrice: 600_000,
    payments: [{ amount: 400_000, type: 'deposit' }],
    instalments: [
      { status: 'paid', amountCents: 200_000, trigger: 'signing' },
      { status: 'paid', amountCents: 200_000, trigger: 'design-approval' },
      { status: 'scheduled', amountCents: 200_000, trigger: 'ready-for-launch' },
    ],
  };

  it('calls it gated while nothing has been confirmed', () => {
    const balance = projectBalance({ ...base, statusStage: 2 });
    expect(balance.gatedCents).toBe(200_000);
    expect(balance.unbilledCents).toBe(0);
  });

  /**
   * The number that moves. `unbilled` is the bucket Priorities reads to say
   * "earned but never invoiced — send the payment"; `gated` is the bucket it
   * deliberately says nothing about. A confirmed launch belongs in the first.
   */
  it('calls it unbilled once we have confirmed it in writing', () => {
    const balance = projectBalance({
      ...base,
      statusStage: 2,
      readyForLaunchAt: new Date('2026-08-01'),
    });
    expect(balance.unbilledCents).toBe(200_000);
    expect(balance.gatedCents).toBe(0);
  });

  it('does not move money that is already invoiced out of dueNow', () => {
    const balance = projectBalance({
      ...base,
      statusStage: 2,
      readyForLaunchAt: new Date('2026-08-01'),
      instalments: [
        { status: 'paid', amountCents: 200_000, trigger: 'signing' },
        { status: 'paid', amountCents: 200_000, trigger: 'design-approval' },
        { status: 'due', amountCents: 200_000, trigger: 'ready-for-launch' },
      ],
    });
    expect(balance.dueNowCents).toBe(200_000);
    expect(balance.unbilledCents).toBe(0);
  });
});

describe('the dashboard list of money nobody has asked for', () => {
  const project = (extra: Record<string, unknown>) => ({
    id: 'p1',
    name: 'Okafor Plumbing Site',
    statusStage: 2,
    client: { company: 'Okafor Plumbing' },
    instalments: [scheduled('ready-for-launch')],
    ...extra,
  });

  it('leaves it off while the launch is unconfirmed', () => {
    expect(uninvoicedPayments([project({})])).toHaveLength(0);
  });

  it('lists it once the confirmation is on the record', () => {
    const rows = uninvoicedPayments([project({ readyForLaunchAt: new Date('2026-08-01') })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'Payment 3 of 3', claim: 'Ready for Launch' });
  });

  /**
   * The exception this file replaces, kept honest: it used to live inline
   * here and nowhere else, and moving it must not have dropped it.
   */
  it('still lists a deemed design approval that no dropdown followed', () => {
    const rows = uninvoicedPayments([
      project({
        statusStage: 1,
        designApprovedAt: new Date('2026-08-01'),
        instalments: [scheduled('design-approval')],
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].claim).toBe('Design Approval');
  });

  it('ignores an instalment that has already been invoiced', () => {
    const rows = uninvoicedPayments([
      project({
        readyForLaunchAt: new Date('2026-08-01'),
        instalments: [{ ...scheduled('ready-for-launch'), status: 'due' }],
      }),
    ]);
    expect(rows).toHaveLength(0);
  });
});
