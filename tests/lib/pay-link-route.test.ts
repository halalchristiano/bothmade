import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The button in an invoice email has to work on day nine.
 *
 * A Stripe Checkout Session dies 24 hours after it is minted. The invoice
 * gives the client fourteen days, and the first chase is not sent until day
 * 14. So the link that went out with the invoice worked on the day it landed
 * and was a Stripe error page every day after — through the entire period the
 * client was being asked to pay in, with nothing chasing and nobody watching.
 * `expires_at` is capped at 24 hours, so there is no longer-lived session to
 * email: the link has to be resolved when it is clicked.
 *
 * That is what /pay/[instalmentId] is for. It already existed to record the
 * click; it redirected to whatever URL was stored on the row, which is exactly
 * the corpse the client was trying to avoid.
 */

const prisma = {
  instalment: {
    findUnique: vi.fn(async (_a: unknown) => null as unknown),
    update: vi.fn(async (_a: unknown) => ({})),
  },
  invoice: { findUnique: vi.fn(async (_a: unknown) => null as unknown) },
};

const sessionsRetrieve = vi.fn(async (_id: string) => ({ status: 'open' }) as unknown);
const sessionsCreate = vi.fn(async (_a: unknown) => ({ id: 'cs_new', url: 'https://stripe.test/cs_new' }) as unknown);

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/site-url', () => ({ resolveSiteUrl: () => 'https://bothmade.test' }));
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { retrieve: sessionsRetrieve, create: sessionsCreate } };
  },
}));

const { GET } = await import('@/app/pay/[instalmentId]/route');

const INSTALMENT = {
  id: 'inst_1',
  projectId: 'proj_1',
  index: 2,
  label: 'Payment 2 of 3',
  amountCents: 300_000,
  paymentUrl: 'https://stripe.test/cs_old',
  stripeSessionId: 'cs_old',
  invoiceNumber: 'BM-2026-0007',
  status: 'due',
  project: { id: 'proj_1', name: 'Acme Site', client: { email: 'client@acme.test' } },
};

const go = async () =>
  GET(new Request('https://bothmade.test/pay/inst_1') as never, {
    params: Promise.resolve({ instalmentId: 'inst_1' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.instalment.findUnique.mockResolvedValue(INSTALMENT);
  prisma.instalment.update.mockResolvedValue({});
  prisma.invoice.findUnique.mockResolvedValue({ id: 'invoice_1', status: 'open' });
  sessionsRetrieve.mockResolvedValue({ status: 'open' });
  sessionsCreate.mockResolvedValue({ id: 'cs_new', url: 'https://stripe.test/cs_new' });
});

describe('a link clicked while the session is still alive', () => {
  it('reuses it rather than minting a second live checkout', async () => {
    const res = await go();

    expect(res.headers.get('location')).toBe('https://stripe.test/cs_old');
    // Two live sessions for one instalment is the double-collection window
    // the whole schedule flow exists to close.
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

/**
 * Only an `open` session may be handed back.
 *
 * A mutation proved this was documented and unheld: relaxing the check to
 * "anything not expired" passed all 2368 tests, because the suite only ever
 * fed it 'open' and 'expired'. A `complete` session belongs to a payment that
 * already happened, and sending a client back to one is how a settled invoice
 * gets presented for payment a second time.
 */
describe('a session Stripe no longer considers payable', () => {
  it.each(['complete', 'expired'])('mints a fresh one rather than reusing a %s session', async (status) => {
    sessionsRetrieve.mockResolvedValue({ status });

    const res = await go();

    expect(sessionsCreate).toHaveBeenCalledOnce();
    expect(res.headers.get('location')).toBe('https://stripe.test/cs_new');
  });
});

describe('a link clicked after the session has expired', () => {
  beforeEach(() => sessionsRetrieve.mockResolvedValue({ status: 'expired' }));

  it('mints a fresh one instead of sending them to a dead Stripe page', async () => {
    const res = await go();

    expect(sessionsCreate).toHaveBeenCalledOnce();
    expect(res.headers.get('location')).toBe('https://stripe.test/cs_new');
  });

  it('carries the ledger invoice so the webhook settles the same row', async () => {
    await go();

    expect((sessionsCreate.mock.calls[0]![0] as { metadata: Record<string, string> }).metadata).toMatchObject({
      existingProjectId: 'proj_1',
      instalmentId: 'inst_1',
      invoiceId: 'invoice_1',
      invoiceNumber: 'BM-2026-0007',
      paymentType: 'balance',
    });
  });

  it('remembers the new session, so the next click reuses it', async () => {
    await go();

    expect(prisma.instalment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { paymentUrl: 'https://stripe.test/cs_new', stripeSessionId: 'cs_new' },
      })
    );
  });

  /**
   * The webhook reads paymentType to decide the Payment row's type, which
   * decides whether it counts toward the contracted price and what the
   * receipt calls it. Index 1 is the deposit; nothing else is.
   */
  it('labels the first instalment a deposit and the rest a balance', async () => {
    await go();
    expect((sessionsCreate.mock.calls[0]![0] as { metadata: Record<string, string> }).metadata.paymentType)
      .toBe('balance');

    vi.clearAllMocks();
    sessionsRetrieve.mockResolvedValue({ status: 'expired' });
    prisma.instalment.findUnique.mockResolvedValue({ ...INSTALMENT, index: 1 });
    prisma.invoice.findUnique.mockResolvedValue({ id: 'invoice_1', status: 'open' });
    await go();
    expect((sessionsCreate.mock.calls[0]![0] as { metadata: Record<string, string> }).metadata.paymentType)
      .toBe('deposit');
  });

  it('charges what the instalment says, not what the old session said', async () => {
    await go();

    const body = sessionsCreate.mock.calls[0]![0] as {
      line_items: Array<{ price_data: { unit_amount: number } }>;
    };
    expect(body.line_items[0].price_data.unit_amount).toBe(300_000);
  });
});

describe('a link that should no longer take money', () => {
  it('sends a paid instalment to their dashboard, not to a checkout', async () => {
    prisma.instalment.findUnique.mockResolvedValue({ ...INSTALMENT, status: 'paid' });

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://bothmade.test/client/proj_1');
  });

  /**
   * The one that would undo a void. Minting on demand means this route can
   * hand back a working link for an invoice somebody deliberately cancelled —
   * so it has to read the invoice, not just the instalment.
   */
  it('refuses to mint a checkout for a voided invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ id: 'invoice_1', status: 'void' });

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://bothmade.test/client/proj_1');
  });

  it('sends a voided instalment to their dashboard', async () => {
    prisma.instalment.findUnique.mockResolvedValue({ ...INSTALMENT, status: 'void' });

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://bothmade.test/client/proj_1');
  });
});

/**
 * The hole between two fixes, which neither one's tests could see.
 *
 * Voiding an instalment invoice resets the row to 'scheduled' and clears its
 * invoice number — that is how the money stays owed without the cancelled
 * bill being re-sendable. This route used to accept 'scheduled' as payable,
 * and with the number already nulled there was no invoice left for its
 * void-check to find. So the void expired the emailed Stripe session, and
 * then the client clicking the link in that same original email was handed a
 * brand-new working checkout for the bill we had just told them was
 * cancelled.
 *
 * 'due' is the only state that means "invoiced and owed". Nothing else may
 * mint.
 */
describe('after the invoice behind it was voided', () => {
  it('refuses the reset row, which is what a void leaves behind', async () => {
    prisma.instalment.findUnique.mockResolvedValue({
      ...INSTALMENT,
      status: 'scheduled',
      invoiceNumber: null,
    });

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://bothmade.test/client/proj_1');
  });

  /** And the same for a row simply not invoiced yet — nothing is owed on it. */
  it('refuses an instalment the schedule has not asked for yet', async () => {
    prisma.instalment.findUnique.mockResolvedValue({ ...INSTALMENT, status: 'scheduled' });

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://bothmade.test/client/proj_1');
  });
});

describe('the click itself', () => {
  it('is recorded whatever else happens', async () => {
    await go();

    expect(prisma.instalment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst_1' },
        data: expect.objectContaining({ linkClicks: { increment: 1 } }),
      })
    );
  });

  /** A client who cannot pay because our analytics failed would be absurd. */
  it('still redirects when recording the click fails', async () => {
    prisma.instalment.update.mockRejectedValue(new Error('db down'));

    const res = await go();

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://stripe.test/cs_old');
  });

  /**
   * Stripe answering without a URL, which is not the same as throwing.
   *
   * A session can come back with `url: null` — an embedded ui_mode, or one
   * Stripe considers already finished. The guard for it existed and nothing
   * held it: returning an empty string instead of null passed all 2473 tests,
   * and an empty string is a redirect to nowhere on the one page whose only
   * job is to get somebody to a checkout.
   */
  it('treats a session with no URL as no session at all', async () => {
    sessionsRetrieve.mockResolvedValue({ status: 'expired' });
    sessionsCreate.mockResolvedValue({ id: 'cs_new', url: null });

    const res = await go();

    expect(res.headers.get('location')).toBe('https://bothmade.test/client/proj_1');
    // And it must not remember a session it never got a link for.
    expect(prisma.instalment.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripeSessionId: 'cs_new' }) })
    );
  });

  /** Stripe refusing must land them somewhere real, not on a broken button. */
  it('falls back to the dashboard when Stripe will not mint', async () => {
    sessionsRetrieve.mockResolvedValue({ status: 'expired' });
    sessionsCreate.mockRejectedValue(new Error('stripe down'));

    const res = await go();

    expect(res.headers.get('location')).toBe('https://bothmade.test/client/proj_1');
  });

  it('sends an unknown instalment to the client area rather than nowhere', async () => {
    prisma.instalment.findUnique.mockResolvedValue(null);

    const res = await go();

    expect(res.headers.get('location')).toBe('https://bothmade.test/client');
  });
});

/**
 * An instalment somebody has already sent part of.
 *
 * Marking an invoice part paid by transfer writes a payment against it and
 * deliberately leaves the instalment `due` — half of Payment 2 of 3 is not
 * Payment 2 of 3. This route reads `due`, and the session it mints used to be
 * for the instalment's FULL amount, so the button in the client's invoice
 * email would have taken three thousand on top of the fifteen hundred they had
 * already transferred.
 *
 * Refusing was the right first answer to that, and it is what this file used
 * to hold. It was also a dead end: the dashboard told them fifteen hundred was
 * left and offered no way to send it, from the one link most clients ever pay
 * from. liveCheckoutUrl takes the outstanding amount now, so the useful answer
 * is available — charge the balance.
 *
 * The void and refund guards below are deliberately unchanged. Those are the
 * cases where a human should decide before anything is collected at all.
 */
describe('an instalment with money already against its invoice', () => {
  it('mints a checkout for the balance, not the face value', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice_1',
      status: 'open',
      payments: [{ amount: 150_000 }],
    });

    const res = await go();

    expect(sessionsCreate).toHaveBeenCalledOnce();
    const body = sessionsCreate.mock.calls[0]![0] as {
      line_items: Array<{ price_data: { unit_amount: number; product_data: { name: string } } }>;
    };
    // The instalment bills 300,000; 150,000 has arrived.
    expect(body.line_items[0].price_data.unit_amount).toBe(150_000);
    expect(body.line_items[0].price_data.product_data.name).toContain('balance');
    expect(res.headers.get('location')).toBe('https://stripe.test/cs_new');
  });

  /**
   * The stored session was minted for the face value, so handing it back on a
   * part-paid row is the same overcharge arriving by a slower route.
   */
  it('will not hand back the cached full-price link', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice_1',
      status: 'open',
      payments: [{ amount: 150_000 }],
    });
    sessionsRetrieve.mockResolvedValue({ status: 'open' });

    const res = await go();

    expect(res.headers.get('location')).toBe('https://stripe.test/cs_new');
  });

  /** Nothing left to collect means no session, and no confusing Stripe page. */
  it('mints nothing once the whole instalment has arrived', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice_1',
      status: 'open',
      payments: [{ amount: 300_000 }],
    });

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://bothmade.test/client/proj_1');
  });

  it('still mints one when nothing has arrived', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ id: 'invoice_1', status: 'open', payments: [] });

    const res = await go();

    expect(res.headers.get('location')).toContain('stripe.test');
  });

  /**
   * And once the money has gone back out again.
   *
   * A refund leaves an open invoice open — it moves `refundedCents`, not
   * `status` — and writes a negative row into the same ledger, so the sum
   * above nets back to exactly the figure that means "nothing ever arrived".
   * Same number, opposite situation: this is a client who was refunded and
   * still has the button in an old email, and it would have taken the
   * instalment in full.
   */
  it('mints nothing once the money has been refunded back out', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice_1',
      status: 'open',
      refundedCents: 150_000,
      // What a refund leaves behind: the payment, and the row that took it back.
      payments: [{ amount: 150_000 }, { amount: -150_000 }],
    });

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://bothmade.test/client/proj_1');
  });

  /* A credit moves no money and so writes no ledger row — the payment is
     still there and the first guard already catches it. Held so the two
     cannot be collapsed into one on the grounds that they look alike. */
  it('mints nothing when the money was credited rather than sent back', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice_1',
      status: 'open',
      refundedCents: 150_000,
      payments: [{ amount: 150_000 }],
    });

    const res = await go();

    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
