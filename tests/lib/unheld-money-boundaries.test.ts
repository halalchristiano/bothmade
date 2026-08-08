import { describe, expect, it } from 'vitest';
import { refundEntitlement, type EntitlementInstalment } from '@/lib/refund-entitlement';
import { buildTiers, comparisonLines } from '@/lib/brochure';

/**
 * Four boundaries a mutation sweep proved nothing was holding.
 *
 * Twenty-seven operator flips across five thinly-tested libraries, one at a
 * time, each run against that library's own tests. Six survived; two of those
 * were equivalent mutations that cannot change an answer, and one sits behind
 * a module-private function with only a cosmetic effect. These four are real,
 * and three of them are in `refund-entitlement` — six mutations, three
 * survived, in the module that decides how much money a client gets back.
 *
 * None of this is a bug today. The code is right; the boundary just had
 * nothing pinned to it, which is how a later edit moves one by accident. Each
 * test below names the mutation it kills.
 */

const RATE = 15_000; // $150/hr — AGENCY_RATE_CENTS
const ADMIN = 25_000; // $250 — PREPAYMENT_ADMIN_FEE_CENTS

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
  // Design — only the signing gate has passed.
  statusStage: 1,
};

describe('hours that cannot be worked', () => {
  /**
   * `typeof hoursWorked === 'number' && hoursWorked > 0` → `||` survived.
   *
   * The two halves guard different mistakes and only the second one catches
   * a negative. Turned into an `or`, any number passes the first half and
   * `hours` becomes the figure as typed — so `-4` bills minus four hours,
   * `timeEarnedCents` goes negative, and the studio's earned figure drops
   * below what the gates alone entitled it to. A stray minus in an admin
   * field would move a settlement in the client's favour and read as
   * arithmetic.
   */
  it('ignores a negative hours entry rather than crediting it', () => {
    const typo = refundEntitlement({ ...base, scenario: 'agency-ends', paidCents: 800_000, hoursWorked: -4 });
    const none = refundEntitlement({ ...base, scenario: 'agency-ends', paidCents: 800_000, hoursWorked: 0 });

    expect(typo.timeEarnedCents).toBe(0);
    expect(typo.timeEarnedCents).toBe(none.timeEarnedCents);
    expect(typo.agencyKeepsCents).toBeGreaterThanOrEqual(0);
  });

  it('still bills real hours', () => {
    const worked = refundEntitlement({ ...base, scenario: 'agency-ends', paidCents: 800_000, hoursWorked: 4 });

    expect(worked.timeEarnedCents).toBe(4 * RATE);
  });

  /** And an absent figure is not the same as zero hours worked — it is unknown. */
  it('treats no hours at all as nothing billed', () => {
    const absent = refundEntitlement({ ...base, scenario: 'agency-ends', paidCents: 800_000 });

    expect(absent.timeEarnedCents).toBe(0);
  });
});

describe('a processor fee that is not a cost', () => {
  /**
   * `processorFeeCents && processorFeeCents > 0` → `||` survived.
   *
   * A deduction reduces what goes back to the client, so a negative one
   * *increases* it. Under the mutation `-500` is truthy, passes, and is
   * pushed onto `deductions` as "Non-recoverable processor fees: -$5" — a
   * line item that hands money back for a fee nobody paid, on the settlement
   * document itself.
   */
  it('refuses a negative processor fee as a deduction', () => {
    const negative = refundEntitlement({
      ...base,
      scenario: 'client-cancels',
      paidCents: 2_000_000,
      hoursWorked: 0,
      processorFeeCents: -500,
    });

    expect(negative.deductions.some((d) => d.amountCents < 0)).toBe(false);
    expect(negative.deductions.map((d) => d.label)).not.toContain('Non-recoverable processor fees');
  });

  it('takes a real one', () => {
    const real = refundEntitlement({
      ...base,
      scenario: 'client-cancels',
      paidCents: 2_000_000,
      hoursWorked: 0,
      processorFeeCents: 500,
    });

    expect(real.deductions).toContainEqual({
      label: 'Non-recoverable processor fees',
      amountCents: 500,
    });
  });
});

describe('saying there is nothing to settle', () => {
  const NOTHING = 'Nothing has been paid and nothing has been earned — there is nothing to settle.';

  /**
   * `paidCents === 0 && agencyKeepsCents === 0` → `||` survived.
   *
   * Both halves have to be true for the sentence to be true, and the `or`
   * makes it a lie in the case that matters most: nothing paid but work
   * earned. That is a project where the client *owes* money — the settlement
   * below it says "Amount due from the Client" — while the caution above it
   * announces there is nothing to settle. Whoever is reading the screen is
   * being told to close the file.
   */
  it('does not say it when nothing was paid but work was earned', () => {
    const owed = refundEntitlement({
      ...base,
      scenario: 'agency-ends',
      paidCents: 0,
      hoursWorked: 10,
    });

    expect(owed.agencyKeepsCents).toBe(10 * RATE);
    expect(owed.settlement.dueFromClientCents).toBe(10 * RATE);
    expect(owed.cautions).not.toContain(NOTHING);
  });

  /** Nor the mirror: money in, nothing earned, and a refund to arrange. */
  it('does not say it when money was paid and nothing was earned', () => {
    const paid = refundEntitlement({
      ...base,
      scenario: 'agency-ends',
      instalments: schedule.map((i) => ({ ...i, status: 'scheduled' as const })),
      paidCents: 800_000,
      hoursWorked: 0,
    });

    expect(paid.agencyKeepsCents).toBe(0);
    expect(paid.cautions).not.toContain(NOTHING);
  });

  /** And does say it when both are genuinely true, or the guard is pointless. */
  it('says it when nothing was paid and nothing was earned', () => {
    const nothing = refundEntitlement({
      ...base,
      scenario: 'agency-ends',
      instalments: schedule.map((i) => ({ ...i, status: 'scheduled' as const })),
      paidCents: 0,
      hoursWorked: 0,
    });

    expect(nothing.cautions).toContain(NOTHING);
  });
});

describe('the brochure comparison table', () => {
  const tiers = buildTiers([
    {
      key: 'essential',
      name: 'The essentials',
      tagline: 'Everything you need to be found.',
      forWho: 'A first proper site.',
      selection: { baseService: 'website', addOns: ['seo'], clientType: 'smb', timeline: 'standard' },
    },
    {
      key: 'recommended',
      name: 'The one we would pick',
      tagline: 'The essentials, plus the numbers.',
      forWho: 'Most businesses.',
      selection: {
        baseService: 'website',
        addOns: ['seo', 'analytics'],
        clientType: 'smb',
        timeline: 'standard',
      },
    },
  ]);

  /**
   * `!seen.has(line.key) && seen.add(line.key)` → `||` survived.
   *
   * `Set.add` returns the Set, which is always truthy, so under the `or`
   * every line passes and the filter stops filtering entirely. The dedup is
   * the only thing standing between this and a comparison table that lists
   * the same feature twice — on the page whose whole job is to let somebody
   * see what one option has that another doesn't.
   *
   * Passing the same tier twice is the honest way to exercise it: the
   * function is exported and takes whatever it is given, and `buildTiers`
   * happening to produce disjoint `addedLines` today is not a property this
   * function is allowed to rely on.
   */
  it('lists each feature once even when a tier is repeated', () => {
    const once = comparisonLines(tiers).map((l) => l.key);
    const twice = comparisonLines([...tiers, tiers[0]]).map((l) => l.key);

    expect(twice).toEqual(once);
    expect(new Set(twice).size).toBe(twice.length);
  });

  it('keeps the first appearance, so the table reads in tier order', () => {
    const keys = comparisonLines(tiers).map((l) => l.key);

    expect(keys[0]).toBe('seo');
    expect(keys).toContain('analytics');
  });

  it('still lists every feature any tier includes', () => {
    const keys = comparisonLines(tiers).map((l) => l.key);

    for (const tier of tiers) {
      for (const line of tier.addedLines) {
        expect(keys, `${line.key} is in ${tier.name} but missing from the table`).toContain(line.key);
      }
    }
  });
});
