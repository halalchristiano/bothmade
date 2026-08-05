import { describe, expect, it } from 'vitest';
import {
  gateOpenedBy,
  stageMessage,
  uninvoicedPayments,
  STAGE_MESSAGES,
  type GateInstalment,
} from '@/lib/stage-gates';

/**
 * The moment a stage change makes money payable is the moment the studio has
 * historically missed — so what is pinned here is mostly the ways it could
 * fire wrongly: twice for the same payment, for a stage with no gate, or on a
 * project moving backwards.
 */

const schedule: GateInstalment[] = [
  { id: 'i1', index: 1, label: 'Payment 1 of 3', amountCents: 800_000, trigger: 'signing', status: 'paid' },
  { id: 'i2', index: 2, label: 'Payment 2 of 3', amountCents: 600_000, trigger: 'design-approval', status: 'scheduled' },
  { id: 'i3', index: 3, label: 'Payment 3 of 3', amountCents: 600_000, trigger: 'ready-for-launch', status: 'scheduled' },
];

describe('a stage change opening a gate', () => {
  it('opens payment 2 when the project moves to Build', () => {
    const gate = gateOpenedBy('build', schedule);

    expect(gate?.label).toBe('Payment 2 of 3');
    expect(gate?.amountCents).toBe(600_000);
  });

  /**
   * The inference this module exists to make visible. The contract's gate is
   * Design Approval; the dropdown moving to Build is our evidence for it, not
   * the thing itself.
   */
  it('names what it is claiming happened, and quotes the clause', () => {
    const gate = gateOpenedBy('build', schedule);

    expect(gate?.claim).toBe('Design Approval');
    expect(gate?.clause).toBe('Section 7');
    expect(gate?.clauseText).toMatch(/deemed approval/);
  });

  it('opens payment 3 at Launch', () => {
    expect(gateOpenedBy('launch', schedule)?.label).toBe('Payment 3 of 3');
  });

  it('opens nothing for a stage with no gate behind it', () => {
    expect(gateOpenedBy('discovery', schedule)).toBeNull();
    expect(gateOpenedBy('design', schedule)).toBeNull();
    expect(gateOpenedBy('complete', schedule)).toBeNull();
  });

  /**
   * The one that would cost real money: prompting again for a payment already
   * invoiced produces a second invoice for the same instalment, and a client
   * with two demands for one payment.
   */
  it('stays silent once that payment has been invoiced', () => {
    const invoiced = schedule.map((i) => (i.index === 2 ? { ...i, status: 'due' } : i));

    expect(gateOpenedBy('build', invoiced)).toBeNull();
  });

  it('stays silent once that payment has been paid', () => {
    const settled = schedule.map((i) => (i.index === 2 ? { ...i, status: 'paid' } : i));

    expect(gateOpenedBy('build', settled)).toBeNull();
  });

  it('stays silent on a project with no schedule at all', () => {
    expect(gateOpenedBy('build', [])).toBeNull();
  });

  it('stays silent when the schedule has no row for that gate', () => {
    const partial = schedule.filter((i) => i.trigger !== 'design-approval');

    expect(gateOpenedBy('build', partial)).toBeNull();
  });
});

describe('money past its gate that nobody invoiced', () => {
  const project = (over: Partial<{ id: string; name: string; statusStage: number; instalments: GateInstalment[] }> = {}) => ({
    id: 'p1',
    name: 'Ridgeline site',
    statusStage: 2,
    client: { company: 'Ridgeline Dental' },
    instalments: schedule,
    ...over,
  });

  it('finds a payment whose gate has passed and which was never sent', () => {
    const found = uninvoicedPayments([project()]);

    expect(found.map((f) => f.label)).toEqual(['Payment 2 of 3']);
    expect(found[0].claim).toBe('Design Approval');
  });

  it('ignores payments whose gate has not been reached', () => {
    const found = uninvoicedPayments([project({ statusStage: 1 })]);

    expect(found).toEqual([]);
  });

  it('ignores payments already invoiced or paid', () => {
    const found = uninvoicedPayments([
      project({ instalments: schedule.map((i) => (i.index === 2 ? { ...i, status: 'due' } : i)) }),
    ]);

    expect(found).toEqual([]);
  });

  it('finds both when a project has run ahead of its billing', () => {
    const found = uninvoicedPayments([project({ statusStage: 4 })]);

    expect(found.map((f) => f.label)).toEqual(['Payment 2 of 3', 'Payment 3 of 3']);
  });

  it('puts the biggest first, so one send is the one that matters', () => {
    const found = uninvoicedPayments([
      project({
        statusStage: 4,
        instalments: [
          { ...schedule[1], amountCents: 100_000 },
          { ...schedule[2], amountCents: 900_000 },
        ],
      }),
    ]);

    expect(found.map((f) => f.amountCents)).toEqual([900_000, 100_000]);
  });

  it('spans projects', () => {
    const found = uninvoicedPayments([
      project(),
      project({ id: 'p2', name: 'Other site', statusStage: 3 }),
    ]);

    expect(found).toHaveLength(3);
  });
});

describe('what the client is told', () => {
  /**
   * The bar this has to clear is low and was not being cleared: the old text
   * was "Project moved to the build phase."
   */
  it('says something a person would actually write', () => {
    const message = stageMessage('build');

    expect(message.title).toMatch(/Design approved/);
    expect(message.body).not.toMatch(/moved to the .* phase/);
    expect(message.body.length).toBeGreaterThan(80);
  });

  it('covers every stage', () => {
    for (const stage of ['discovery', 'design', 'build', 'launch', 'complete']) {
      expect(STAGE_MESSAGES[stage]).toBeDefined();
      expect(STAGE_MESSAGES[stage].body.length).toBeGreaterThan(60);
    }
  });

  it('falls back rather than throwing on a stage it has never heard of', () => {
    const message = stageMessage('archaeology');

    expect(message.title).toContain('archaeology');
  });
});
