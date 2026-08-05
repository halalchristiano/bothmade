import { describe, expect, it } from 'vitest';
import { buildDealTimeline, dealProgress, nextAction, type DealTimelineInput } from '@/lib/deal-timeline';

/**
 * The timeline exists so a rep never has to assemble a deal's state from four
 * screens. That only holds if the rules are right, so they are pinned here
 * rather than eyeballed on a rendered page.
 */

const BLANK: DealTimelineInput = {
  status: 'new',
  contractStatus: 'not_sent',
  coldEmailSentAt: null,
  agreementSignedAt: null,
  proposalTotalPrice: null,
  latestMockupAt: null,
  activities: [],
  project: null,
};

const inst = (
  index: number,
  status: string,
  amountCents = 800_000,
  paidAt: string | null = null
) => ({ index, label: `Payment ${index} of 3`, amountCents, status, paidAt, dueAt: null });

describe('a brand new lead', () => {
  it('shows nothing done and points at the phone', () => {
    const steps = buildDealTimeline(BLANK);

    expect(steps.every((s) => s.state !== 'done')).toBe(true);
    expect(steps[0]).toMatchObject({ key: 'contacted', state: 'current' });
    expect(nextAction(steps)).toBe('Next: get them on the phone.');
  });

  it('still shows the money steps, so the finish line is visible from the start', () => {
    expect(buildDealTimeline(BLANK).some((s) => s.key.startsWith('payment-'))).toBe(true);
  });
});

describe('the current step', () => {
  it('is the first thing not yet done, and there is exactly one', () => {
    const steps = buildDealTimeline({
      ...BLANK,
      activities: [{ type: 'call', createdAt: '2026-08-01T10:00:00Z' }],
      latestMockupAt: '2026-08-02T10:00:00Z',
    });

    expect(steps.filter((s) => s.state === 'current')).toHaveLength(1);
    expect(steps.find((s) => s.state === 'current')?.key).toBe('proposal');
    expect(nextAction(steps)).toBe('Next: send the sign-and-pay link.');
  });

  /**
   * An instalment waiting on its gate is not work anyone is failing to do.
   * Marking it as the current action would put a to-do on a healthy deal and
   * invite someone to invoice a milestone the client hasn't reached.
   */
  it('skips a payment that is gated rather than owed', () => {
    const steps = buildDealTimeline({
      ...BLANK,
      contractStatus: 'signed',
      agreementSignedAt: '2026-08-03T10:00:00Z',
      latestMockupAt: '2026-08-02T10:00:00Z',
      activities: [
        { type: 'call', createdAt: '2026-08-01T10:00:00Z' },
        { type: 'proposal', createdAt: '2026-08-02T12:00:00Z' },
      ],
      project: {
        instalments: [
          inst(1, 'paid', 800_000, '2026-08-03T11:00:00Z'),
          inst(2, 'scheduled'),
          inst(3, 'scheduled'),
        ],
      },
    });

    expect(steps.find((s) => s.key === 'payment-2')?.state).toBe('blocked');
    expect(steps.filter((s) => s.state === 'current')).toHaveLength(0);
    expect(nextAction(steps)).toBe('Waiting on a milestone. Nothing to send yet.');
  });

  it('makes an invoiced payment the current action', () => {
    const steps = buildDealTimeline({
      ...BLANK,
      contractStatus: 'signed',
      agreementSignedAt: '2026-08-03T10:00:00Z',
      latestMockupAt: '2026-08-02T10:00:00Z',
      activities: [
        { type: 'call', createdAt: '2026-08-01T10:00:00Z' },
        { type: 'proposal', createdAt: '2026-08-02T12:00:00Z' },
      ],
      project: {
        instalments: [inst(1, 'paid', 800_000, '2026-08-03T11:00:00Z'), inst(2, 'due'), inst(3, 'scheduled')],
      },
    });

    expect(steps.find((s) => s.key === 'payment-2')?.state).toBe('current');
    expect(nextAction(steps)).toBe('Next: collect Payment 2 of 3.');
  });

  it('marks nothing current on a lost deal', () => {
    const steps = buildDealTimeline({ ...BLANK, status: 'lost' });

    expect(steps.some((s) => s.state === 'current')).toBe(false);
  });
});

describe('what each step says', () => {
  it('dates the first touch, not the most recent one', () => {
    const steps = buildDealTimeline({
      ...BLANK,
      activities: [
        { type: 'call', createdAt: '2026-08-09T10:00:00Z' },
        { type: 'email', createdAt: '2026-08-01T10:00:00Z' },
      ],
    });

    expect(steps[0].at).toBe(new Date('2026-08-01T10:00:00Z').toISOString());
  });

  it('distinguishes a proposal built from a proposal sent', () => {
    const built = buildDealTimeline({ ...BLANK, proposalTotalPrice: 1_450_000 });
    expect(built.find((s) => s.key === 'proposal')?.detail).toContain('not sent');

    const sent = buildDealTimeline({
      ...BLANK,
      proposalTotalPrice: 1_450_000,
      contractStatus: 'sent',
      activities: [{ type: 'proposal', createdAt: '2026-08-02T12:00:00Z' }],
    });
    expect(sent.find((s) => s.key === 'proposal')?.state).toBe('done');
    expect(sent.find((s) => s.key === 'proposal')?.detail).toBe('$14,500 quoted');
  });

  it('never leaves a step without a line of context', () => {
    for (const steps of [buildDealTimeline(BLANK), buildDealTimeline({ ...BLANK, status: 'lost' })]) {
      expect(steps.every((s) => s.detail.trim().length > 0)).toBe(true);
    }
  });
});

describe('progress', () => {
  it('is zero on an untouched deal and one on a finished one', () => {
    expect(dealProgress(buildDealTimeline(BLANK))).toBe(0);

    const finished = buildDealTimeline({
      ...BLANK,
      status: 'won',
      contractStatus: 'signed',
      agreementSignedAt: '2026-08-03T10:00:00Z',
      latestMockupAt: '2026-08-02T10:00:00Z',
      activities: [
        { type: 'call', createdAt: '2026-08-01T10:00:00Z' },
        { type: 'proposal', createdAt: '2026-08-02T12:00:00Z' },
      ],
      project: {
        instalments: [
          inst(1, 'paid', 800_000, '2026-08-03T11:00:00Z'),
          inst(2, 'paid', 600_000, '2026-09-03T11:00:00Z'),
          inst(3, 'paid', 600_000, '2026-10-03T11:00:00Z'),
        ],
      },
    });
    expect(dealProgress(finished)).toBe(1);
    expect(nextAction(finished)).toBe('Nothing outstanding — this one is done.');
  });
});

/**
 * The one Kiana caught on a live deal: a signed, twice-paid project whose
 * timeline read "Next: show them a mockup". That ship had sailed three
 * stages earlier — the gap is history, not a to-do.
 */
describe('a deal that has overtaken its own gaps', () => {
  const SIGNED_NO_MOCKUP: DealTimelineInput = {
    ...BLANK,
    status: 'won',
    contractStatus: 'signed',
    agreementSignedAt: '2026-08-04T10:00:00Z',
    latestMockupAt: null,
    activities: [
      { type: 'call', createdAt: '2026-08-02T10:00:00Z' },
      { type: 'proposal', createdAt: '2026-08-03T12:00:00Z' },
    ],
    project: {
      instalments: [
        inst(1, 'paid', 635_000, '2026-08-04T11:00:00Z'),
        inst(2, 'paid', 317_500, '2026-08-05T11:00:00Z'),
        inst(3, 'scheduled', 317_500),
      ],
    },
  };

  it('does not send a rep back to a stage the client already bought past', () => {
    const steps = buildDealTimeline(SIGNED_NO_MOCKUP);

    expect(steps.find((s) => s.key === 'mockup')?.state).toBe('todo');
    expect(steps.find((s) => s.state === 'current')?.key).not.toBe('mockup');
    expect(nextAction(steps)).not.toContain('mockup');
  });

  it('still shows the gap, because it is a true fact about the deal', () => {
    const steps = buildDealTimeline(SIGNED_NO_MOCKUP);

    expect(steps.find((s) => s.key === 'mockup')?.detail).toBe('No mockup attached');
  });

  it('points at the only thing left that can be acted on', () => {
    // Payment 3 is gated, so there is nothing to do — and saying so is more
    // use than inventing a task.
    expect(nextAction(buildDealTimeline(SIGNED_NO_MOCKUP))).toBe(
      'Waiting on a milestone. Nothing to send yet.'
    );
  });

  it('names the payment once it has actually been invoiced', () => {
    const steps = buildDealTimeline({
      ...SIGNED_NO_MOCKUP,
      project: {
        instalments: [
          inst(1, 'paid', 635_000, '2026-08-04T11:00:00Z'),
          inst(2, 'paid', 317_500, '2026-08-05T11:00:00Z'),
          inst(3, 'due', 317_500),
        ],
      },
    });

    expect(nextAction(steps)).toBe('Next: collect Payment 3 of 3.');
  });
});

describe('the delivery half', () => {
  /**
   * Sales could see whether the money landed and nothing about what happened
   * to the work — so a closer's view of a deal ended at the invoice, and "did
   * the thing I sold turn out well" meant leaving Sales to find out.
   */
  const won = (project: DealTimelineInput['project']) =>
    buildDealTimeline({
      ...BLANK,
      status: 'won',
      contractStatus: 'signed',
      agreementSignedAt: '2026-01-10',
      proposalTotalPrice: 2_000_000,
      project,
    });

  it('says what stage the build is at', () => {
    const delivery = won({ status: 'build', statusStage: 2, liveUrl: null, instalments: [] }).find(
      (s) => s.key === 'delivery'
    );

    expect(delivery?.label).toBe('Build');
    expect(delivery?.detail).toMatch(/In Build/);
  });

  it('calls a project with a live URL delivered', () => {
    const delivery = won({
      status: 'complete',
      statusStage: 4,
      liveUrl: 'https://example.test',
      instalments: [],
    }).find((s) => s.key === 'delivery');

    expect(delivery?.label).toBe('Live');
    expect(delivery?.state).toBe('done');
  });

  /**
   * Finished but with no URL set is not done: the client's delivery moment
   * has not fired, which is the whole point of Priorities' deliver band.
   */
  it('does not call a finished project delivered until the URL is set', () => {
    const delivery = won({ status: 'complete', statusStage: 4, liveUrl: null, instalments: [] }).find(
      (s) => s.key === 'delivery'
    );

    expect(delivery?.state).not.toBe('done');
    expect(delivery?.detail).toMatch(/no live URL/i);
  });

  it('shows nothing at all on a deal that never became a project', () => {
    expect(won(null).find((s) => s.key === 'delivery')).toBeUndefined();
  });
});
