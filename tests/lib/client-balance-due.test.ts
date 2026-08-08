import { describe, expect, it } from 'vitest';
import { projectBalance } from '@/lib/billing';

/**
 * What the client's own portal is allowed to tell them they owe.
 *
 * `projectBalance()` has clamped at zero since it was written, and every
 * admin surface goes through it. `/api/projects/[projectId]` — the endpoint
 * behind the CLIENT's portal — did the arithmetic itself, `totalPrice -
 * amountPaid`, with no clamp.
 *
 * Found by opening the portal in a browser as a client. A project carrying
 * payments beyond its quoted total showed the person who paid them a Balance
 * Due of minus four thousand nine hundred and fifty, a progress bar pinned at
 * full, and a button underneath asking them for the next instalment. The same
 * figure goes into the "Copy status summary" text, which gets pasted into
 * emails to that client.
 *
 * Overpayment is not exotic: an instalment paid twice, a manual payment logged
 * against the project, a custom charge recorded on it. The admin side has
 * always coped. The client side is the one that renders it to the person
 * holding the card.
 */

const project = (totalPrice: number, paid: number[]) => ({
  totalPrice,
  statusStage: 1,
  payments: paid.map((amount) => ({ amount, type: 'balance' })),
  instalments: [],
});

/** The endpoint's own expression, now clamped the same way. */
const clientBalanceDue = (totalPrice: number, paid: number[]) =>
  Math.max(0, totalPrice - paid.reduce((s, a) => s + a, 0));

describe('a project that has been overpaid', () => {
  it('owes nothing rather than a negative amount', () => {
    expect(clientBalanceDue(750_000, [1_245_000])).toBe(0);
  });

  it('agrees with the helper every admin screen uses', () => {
    const p = project(750_000, [1_245_000]);
    expect(clientBalanceDue(p.totalPrice, [1_245_000])).toBe(projectBalance(p).remainingCents);
  });

  /**
   * A refund is a Payment row with a negative amount, so it can take a
   * fully-paid project back into owing something. That has to still work.
   */
  it('still owes the difference after a refund', () => {
    expect(clientBalanceDue(750_000, [750_000, -200_000])).toBe(200_000);
  });
});

describe('the ordinary cases, unchanged', () => {
  it('owes the whole quote when nothing has been paid', () => {
    expect(clientBalanceDue(750_000, [])).toBe(750_000);
  });

  it('owes the remainder part way through', () => {
    expect(clientBalanceDue(750_000, [300_000])).toBe(450_000);
  });

  it('owes nothing when it is settled exactly', () => {
    expect(clientBalanceDue(750_000, [750_000])).toBe(0);
  });
});
