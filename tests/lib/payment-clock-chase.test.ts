import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The chase cron, which had no test at all.
 *
 * chaseState() is covered thoroughly in payment-chase.test.ts and passes
 * every mutation thrown at it, which made this look tested. It is a pure
 * function about dates and phase names; it does not know what money is. Every
 * part of this job that can take the wrong amount off a client lives out
 * here, in the 300 lines that actually mint the Stripe session and send the
 * email — and none of it was held by anything.
 *
 * ## What that hid
 *
 * Marking an invoice paid used to record the invoice's full amount whatever
 * arrived; that was fixed, and part payments now land correctly. An invoice
 * with money against it that does not cover it stays `open`, and its
 * instalment stays `due`, which is right — the rest is still owed.
 *
 * This job selects every `due` instalment and chased it for `inst.amountCents`
 * — the amount BILLED. It never looked at what had come in. So a client who
 * transferred $6,000 against a $12,000 instalment got an email the next
 * morning saying $12,000 was overdue, with a Stripe checkout for $12,000
 * behind the button. Paying it, which is what an email like that is designed
 * to make somebody do, hands us $18,000 for a $12,000 bill.
 *
 * Neither half of that is a bug on its own. Part payments are right, and
 * chasing a `due` instalment is right. It is the seam between them, which is
 * the only place either one's tests were never going to look.
 */

const prisma = {
  project: { findMany: vi.fn(async (_a: unknown) => [] as unknown[]), update: vi.fn(async (_a: unknown) => ({})) },
  projectUpdate: { create: vi.fn(async (_a: unknown) => ({})) },
  instalment: {
    findMany: vi.fn(async (_a: unknown) => [] as unknown[]),
    update: vi.fn(async (_a: unknown) => ({})),
  },
  invoice: { findMany: vi.fn(async (_a: unknown) => [] as unknown[]) },
};

const sessionsCreate = vi.fn(
  async (_a: unknown) => ({ id: 'cs_new', url: 'https://stripe.test/cs_new' }) as unknown
);
const sessionsExpire = vi.fn(async (_id: string) => ({}) as unknown);
const sendPaymentChaseEmail = vi.fn(async (_a: unknown) => ({ sent: true }));
const notifyAdminsPaymentNeedsCall = vi.fn(async (_a: unknown) => ({}));

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/cron-auth', () => ({ requireCronAuth: () => null }));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.test' }));
vi.mock('@/lib/email', () => ({
  sendPaymentChaseEmail,
  sendDesignApprovedEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock('@/lib/notify', () => ({
  notifyAdminsPaymentNeedsCall,
  notifyAdminsDesignDeemedApproved: vi.fn(async () => ({})),
}));
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate, expire: sessionsExpire } };
  },
}));

const { GET } = await import('@/app/api/cron/payment-clock/route');

/** Invoiced 21 days ago: past due, past the grace period, and a chase day. */
const INVOICED_AT = new Date('2026-07-15T09:00:00Z');
const NOW = new Date('2026-08-05T09:00:00Z');

const INSTALMENT = {
  id: 'inst_1',
  projectId: 'proj_1',
  index: 2,
  label: 'Payment 2 of 3',
  amountCents: 1_200_000,
  invoiceNumber: 'BM-2026-0007',
  stripeSessionId: 'cs_old',
  invoicedAt: INVOICED_AT,
  dueAt: new Date('2026-07-29T09:00:00Z'),
  lastChasedAt: null,
  chaseCount: 0,
  project: {
    id: 'proj_1',
    name: 'Acme Site',
    client: {
      company: 'Acme Ltd',
      email: 'client@acme.test',
      contactName: 'Dana',
      phone: '+15550000',
    },
  },
};

const go = async () =>
  GET(new Request('https://bothmade.test/api/cron/payment-clock') as never);

/** The Stripe session this run minted, and what it would have charged. */
const charged = (): number =>
  (sessionsCreate.mock.calls[0]![0] as {
    line_items: Array<{ price_data: { unit_amount: number } }>;
  }).line_items[0].price_data.unit_amount;

const emailed = () => sendPaymentChaseEmail.mock.calls[0]![0] as Record<string, string>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.project.findMany.mockResolvedValue([]);
  prisma.instalment.findMany.mockResolvedValue([INSTALMENT]);
  prisma.instalment.update.mockResolvedValue({});
  prisma.invoice.findMany.mockResolvedValue([
    { number: 'BM-2026-0007', status: 'open', payments: [] },
  ]);
  sessionsCreate.mockResolvedValue({ id: 'cs_new', url: 'https://stripe.test/cs_new' });
  sendPaymentChaseEmail.mockResolvedValue({ sent: true });
});

describe('an instalment nobody has paid anything toward', () => {
  it('is chased for the whole thing', async () => {
    const res = await go();

    expect(await res.json()).toMatchObject({ chased: 1 });
    expect(charged()).toBe(1_200_000);
    expect(emailed().amountLabel).toBe('$12,000');
  });
});

describe('an instalment a client has part paid', () => {
  const partPaid = () =>
    prisma.invoice.findMany.mockResolvedValue([
      { number: 'BM-2026-0007', status: 'open', payments: [{ amount: 600_000 }] },
    ]);

  /** The one that costs money. */
  it('mints a checkout for the balance, not the face value', async () => {
    partPaid();

    await go();

    expect(sessionsCreate).toHaveBeenCalledOnce();
    expect(charged()).toBe(600_000);
  });

  it('asks for the balance in the email too', async () => {
    partPaid();

    await go();

    // The subject comes from chaseState, which is handed the same figure —
    // an email whose subject and button disagree about the amount is its own
    // kind of alarming.
    expect(emailed().amountLabel).toBe('$6,000');
    expect(emailed().subject).toContain('$6,000');
  });

  /**
   * Because a smaller number on its own reads as us having lost their money.
   * They paid $6,000 against something called "Payment 2 of 3"; the email has
   * to say we have it.
   */
  it('tells them what has already been received', async () => {
    partPaid();

    await go();

    expect(emailed().line).toContain('$6,000');
    expect(emailed().line).toContain('$12,000');
  });

  it('says the Stripe line is a balance, so the checkout page agrees', async () => {
    partPaid();

    await go();

    const name = (sessionsCreate.mock.calls[0]![0] as {
      line_items: Array<{ price_data: { product_data: { name: string } } }>;
    }).line_items[0].price_data.product_data.name;
    expect(name).toContain('balance');
  });

  /**
   * A refund is a negative Payment row against the same invoice. Money that
   * came in and went back out again is not money we are holding, so the
   * balance owed goes back up — which is what summing the ledger gives for
   * free, and what a stored "amount received" would have got wrong.
   */
  it('counts a refunded part payment back as owed', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        number: 'BM-2026-0007',
        status: 'open',
        payments: [{ amount: 600_000 }, { amount: -600_000 }],
      },
    ]);

    await go();

    expect(charged()).toBe(1_200_000);
  });
});

describe('an instalment whose invoice has been settled in full', () => {
  it('is not chased at all', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { number: 'BM-2026-0007', status: 'open', payments: [{ amount: 1_200_000 }] },
    ]);

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(sendPaymentChaseEmail).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ chased: 0 });
  });

  /**
   * The instalment and its invoice disagreeing is a data problem, and a chase
   * email is the worst possible place to resolve it — silence costs a day,
   * a wrong bill costs a client.
   */
  it.each(['paid', 'void'])('leaves a %s invoice alone whatever the instalment says', async (status) => {
    prisma.invoice.findMany.mockResolvedValue([
      { number: 'BM-2026-0007', status, payments: [] },
    ]);

    await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(sendPaymentChaseEmail).not.toHaveBeenCalled();
  });
});

/**
 * Instalments invoiced before the invoice ledger existed have a number and no
 * row behind it. Nothing is known about part payments on those, so they are
 * chased for their face value exactly as they always were.
 */
describe('an instalment with no ledger row behind it', () => {
  it('is still chased, for the amount on the schedule', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    await go();

    expect(charged()).toBe(1_200_000);
    expect(emailed().line).not.toContain('balance');
  });
});

describe('the rest of the chase, which nothing held either', () => {
  it('kills the previous session, so one payment never has two live links', async () => {
    await go();

    expect(sessionsExpire).toHaveBeenCalledWith('cs_old');
    // Minted first, expired second: a client with a stale link is better off
    // than one with no link at all.
    expect(sessionsCreate.mock.invocationCallOrder[0]).toBeLessThan(
      sessionsExpire.mock.invocationCallOrder[0]!
    );
  });

  it('sends them through our own domain rather than straight to Stripe', async () => {
    await go();

    expect(emailed().paymentUrl).toBe('https://bothmade.test/pay/inst_1');
  });

  it('does not count a chase whose email bounced, so tomorrow tries again', async () => {
    sendPaymentChaseEmail.mockResolvedValue({ sent: false });

    const res = await go();

    expect(prisma.instalment.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ chaseCount: { increment: 1 } }) })
    );
    expect(await res.json()).toMatchObject({ chased: 0, failed: 1 });
  });

  it('does not email at all when Stripe will not mint a link', async () => {
    sessionsCreate.mockRejectedValue(new Error('stripe down'));

    const res = await go();

    expect(sendPaymentChaseEmail).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ chased: 0, failed: 1 });
  });

  it('leaves an instalment still inside its terms alone', async () => {
    prisma.instalment.findMany.mockResolvedValue([
      { ...INSTALMENT, invoicedAt: new Date('2026-08-01T09:00:00Z'), dueAt: new Date('2026-08-15T09:00:00Z') },
    ]);

    const res = await go();

    expect(sendPaymentChaseEmail).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ chased: 0 });
  });
});
