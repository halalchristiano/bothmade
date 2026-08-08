import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The webhook is the only place a payment turns into a project, a client
 * login, and a Payment row. The two things that must never break: an
 * unverified body is never processed, and a redelivered event never creates
 * a second project or double-counts the money.
 */

const constructWebhookEvent = vi.fn();

const prisma = {
  project: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  client: { findUnique: vi.fn(), create: vi.fn() },
  emailPreferences: { create: vi.fn() },
  projectUpdate: { create: vi.fn() },
  payment: { create: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn() },
  lead: { update: vi.fn(), updateMany: vi.fn() },
  invoice: { updateMany: vi.fn(), findUnique: vi.fn() },
  instalment: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  teamMessage: { create: vi.fn() },
  user: { findFirst: vi.fn() },
  // The route wraps money writes in transactions; the mock hands the same
  // client back so every call stays observable on these spies.
  $transaction: vi.fn((fn: unknown) =>
    typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(prisma) : Promise.all(fn as Promise<unknown>[])
  ),
};

vi.mock('@/lib/stripe', () => ({
  constructWebhookEvent: (...args: unknown[]) => constructWebhookEvent(...args),
}));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({
  generateRandomPassword: () => 'generated-password',
  hashPassword: async () => 'hashed-password',
}));
vi.mock('@/lib/email', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notifyAdminsPaymentReceived: vi.fn() }));

const { POST } = await import('@/app/api/webhooks/stripe/route');
const { sendWelcomeEmail } = await import('@/lib/email');
const { notifyAdminsPaymentReceived } = await import('@/lib/notify');

function request(body = '{}', signature = 'sig') {
  return {
    text: async () => body,
    headers: { get: (name: string) => (name === 'stripe-signature' ? signature : null) },
  } as unknown as Parameters<typeof POST>[0];
}

function completedSession(metadata: Record<string, string>, amountTotal: number | null = 450000) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: { id: 'cs_test_1', metadata, amount_total: amountTotal, customer: 'cus_1' },
    },
  };
}

const NEW_SALE_METADATA = {
  clientEmail: 'frell@linpotia.com',
  company: 'Linpotia Cafe',
  contactName: 'Frell Handa',
  baseService: 'website',
  addOns: 'seo,analytics',
  timeline: 'rush',
  basePrice: '300000',
  totalPrice: '450000',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Prisma findMany never returns undefined; neither may the mock.
  prisma.instalment.findMany.mockResolvedValue([]);

  prisma.project.findFirst.mockResolvedValue(null);
  prisma.project.create.mockResolvedValue({ id: 'proj_1' });
  prisma.project.update.mockResolvedValue({ id: 'proj_1' });
  prisma.client.findUnique.mockResolvedValue(null);
  prisma.client.create.mockResolvedValue({ id: 'client_1' });
  prisma.emailPreferences.create.mockResolvedValue({});
  prisma.projectUpdate.create.mockResolvedValue({});
  prisma.payment.create.mockResolvedValue({});
  prisma.payment.findUnique.mockResolvedValue(null);
  prisma.lead.update.mockResolvedValue({ id: 'lead_1', assignedToId: 'user_1', signedContractUrl: null });
  prisma.lead.updateMany.mockResolvedValue({ count: 1 });
  prisma.teamMessage.create.mockResolvedValue({});
  prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
  prisma.user.findFirst.mockResolvedValue({ id: 'user_1' });
});

describe('signature verification', () => {
  it('refuses a body whose signature does not verify', async () => {
    constructWebhookEvent.mockReturnValue(null);

    const res = await POST(request());

    expect(res.status).toBe(400);
    // Nothing at all may touch the database on an unverified payload.
    expect(prisma.project.create).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('verifies against the raw body text, not a parsed object', async () => {
    constructWebhookEvent.mockReturnValue(null);
    await POST(request('{"raw":"body"}', 'sig_abc'));

    expect(constructWebhookEvent).toHaveBeenCalledWith('{"raw":"body"}', 'sig_abc');
  });

  it('ignores event types it does not handle', async () => {
    constructWebhookEvent.mockReturnValue({ type: 'invoice.paid', data: { object: {} } });

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });
});

describe('a new sale', () => {
  it('creates the client, project, update and payment', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(NEW_SALE_METADATA));

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(prisma.client.create).toHaveBeenCalledOnce();
    expect(prisma.project.create).toHaveBeenCalledOnce();
    expect(prisma.payment.create).toHaveBeenCalledOnce();

    expect(prisma.project.create.mock.calls[0][0].data).toMatchObject({
      clientId: 'client_1',
      baseService: 'website',
      addOns: 'seo,analytics',
      basePrice: 300000,
      totalPrice: 450000,
      stripeSessionId: 'cs_test_1',
      status: 'discovery',
    });
  });

  it('records the amount Stripe actually collected, not the quoted total', async () => {
    // If they paid a deposit, the Payment row is the deposit — not the quote.
    constructWebhookEvent.mockReturnValue(
      completedSession({ ...NEW_SALE_METADATA, paymentType: 'deposit' }, 225000)
    );

    await POST(request());

    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
      amount: 225000,
      type: 'deposit',
      stripeSessionId: 'cs_test_1',
    });
  });

  it('falls back to the quoted total when Stripe reports no amount', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(NEW_SALE_METADATA, null));

    await POST(request());

    expect(prisma.payment.create.mock.calls[0][0].data.amount).toBe(450000);
  });

  it('files anything that is not a deposit as a full payment', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(NEW_SALE_METADATA));
    await POST(request());
    expect(prisma.payment.create.mock.calls[0][0].data.type).toBe('full');
  });

  it('is idempotent — a redelivered event creates nothing twice', async () => {
    // The include guarantees instalments on the real query; a seeded project
    // short-circuits, which is exactly the nothing-twice contract.
    prisma.project.findFirst.mockResolvedValue({ id: 'proj_existing', totalPrice: 500000, instalments: [{ id: 'i1' }] });
    constructWebhookEvent.mockReturnValue(completedSession(NEW_SALE_METADATA));

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(prisma.project.create).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('reuses an existing client instead of creating a duplicate account', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'client_existing' });
    constructWebhookEvent.mockReturnValue(completedSession(NEW_SALE_METADATA));

    await POST(request());

    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.emailPreferences.create).not.toHaveBeenCalled();
    expect(prisma.project.create.mock.calls[0][0].data.clientId).toBe('client_existing');
    // No new password was generated, so none may be emailed out.
    expect(vi.mocked(sendWelcomeEmail).mock.calls[0][2]).toMatch(/existing account/i);
  });

  it('sends the generated password to a brand-new client', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(NEW_SALE_METADATA));
    await POST(request());
    expect(vi.mocked(sendWelcomeEmail).mock.calls[0][2]).toBe('generated-password');
  });

  it('marks the originating lead won and tells the team', async () => {
    constructWebhookEvent.mockReturnValue(
      completedSession({ ...NEW_SALE_METADATA, leadId: 'lead_1' })
    );

    await POST(request());

    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: 'lead_1' }, data: { status: 'won' } });
    expect(prisma.teamMessage.create).toHaveBeenCalledOnce();
  });

  // Stripe retries, and this handler is meant to be idempotent — so the close
  // date is stamped through a `wonAt: null` guard rather than read-then-write.
  // A redelivered webhook must not re-date a deal that was already closed.
  it('stamps the close date only if the deal has not already got one', () => {
    constructWebhookEvent.mockReturnValue(
      completedSession({ ...NEW_SALE_METADATA, leadId: 'lead_1' })
    );

    return POST(request()).then(() => {
      const call = prisma.lead.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'lead_1', wonAt: null });
      expect(call.data.wonAt).toBeInstanceOf(Date);
    });
  });

  it('carries a signed contract across to the client-visible project', async () => {
    prisma.lead.update.mockResolvedValue({
      id: 'lead_1',
      assignedToId: 'user_1',
      signedContractUrl: 'https://blob.test/contract.pdf',
    });
    constructWebhookEvent.mockReturnValue(
      completedSession({ ...NEW_SALE_METADATA, leadId: 'lead_1' })
    );

    await POST(request());

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'proj_1' },
      data: { contractUrl: 'https://blob.test/contract.pdf' },
    });
  });

  it('does not touch a lead when the sale came from the public form', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(NEW_SALE_METADATA));
    await POST(request());
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('drops junk add-on keys instead of storing them on the project', async () => {
    constructWebhookEvent.mockReturnValue(
      completedSession({ ...NEW_SALE_METADATA, addOns: 'seo, not-real ,toString,analytics' })
    );

    await POST(request());

    expect(prisma.project.create.mock.calls[0][0].data.addOns).toBe('seo,analytics');
  });

  it('falls back to sane defaults when the metadata is partly missing', async () => {
    constructWebhookEvent.mockReturnValue(
      completedSession({ clientEmail: 'a@b.com', company: 'Acme' })
    );

    await POST(request());

    const data = prisma.project.create.mock.calls[0][0].data;
    expect(data.baseService).toBe('website');
    expect(data.basePrice).toBe(300000); // the website list price
    expect(data.totalPrice).toBe(300000);
  });

  it('reports a failure so Stripe retries, rather than swallowing it', async () => {
    prisma.project.create.mockRejectedValue(new Error('db down'));
    constructWebhookEvent.mockReturnValue(completedSession(NEW_SALE_METADATA));

    const res = await POST(request());

    expect(res.status).toBe(500);
  });

  it('rejects a completed session carrying no metadata at all', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(null as unknown as Record<string, string>));

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(prisma.project.create).not.toHaveBeenCalled();
  });
});

const BALANCE_METADATA = { existingProjectId: 'proj_9', paymentType: 'balance' };

describe('a payment against an existing project', () => {
  beforeEach(() => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_9',
      name: 'Acme — Website',
      status: 'build',
      client: { company: 'Acme' },
    });
  });

  it('records the payment without creating another project', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(BALANCE_METADATA, 150000));

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(prisma.project.create).not.toHaveBeenCalled();
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
      projectId: 'proj_9',
      amount: 150000,
      type: 'balance',
    });
    expect(notifyAdminsPaymentReceived).toHaveBeenCalledOnce();
  });

  it('is idempotent on the payment, keyed by the Stripe session', async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 'pay_existing' });
    constructWebhookEvent.mockReturnValue(completedSession(BALANCE_METADATA, 150000));

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(notifyAdminsPaymentReceived).not.toHaveBeenCalled();
  });

  it('fails loudly when the project the payment names does not exist', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    constructWebhookEvent.mockReturnValue(completedSession(BALANCE_METADATA, 150000));

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});

/**
 * A one-off charge is the one payment that must NOT read as money toward the
 * project's contracted price. If it files itself as a balance payment, a
 * client billed $2,000 for a change request looks $2,000 closer to having
 * paid off a build they still owe in full.
 */
describe('a custom charge being paid', () => {
  const CUSTOM_METADATA = {
    existingProjectId: 'proj_9',
    paymentType: 'custom',
    invoiceId: 'inv_1',
    invoiceNumber: 'BM-2026-0007',
  };

  beforeEach(() => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_9',
      name: 'Acme — Website',
      status: 'build',
      client: { company: 'Acme' },
    });
  });

  it('files the payment as custom, against its invoice', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(CUSTOM_METADATA, 50000));

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
      projectId: 'proj_9',
      amount: 50000,
      type: 'custom',
      invoiceId: 'inv_1',
    });
  });

  it('marks the invoice paid, and only while it is still open', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(CUSTOM_METADATA, 50000));

    await POST(request());

    const call = prisma.invoice.updateMany.mock.calls[0][0];
    // Scoped to status 'open' so a redelivered event cannot rewrite paidAt.
    expect(call.where).toMatchObject({ id: 'inv_1', status: 'open' });
    expect(call.data.status).toBe('paid');
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it('names the invoice in the update the client reads', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(CUSTOM_METADATA, 50000));

    await POST(request());

    expect(prisma.projectUpdate.create.mock.calls[0][0].data.description).toContain('BM-2026-0007');
  });

  /**
   * The one the door was closed on today, from the other side.
   *
   * An invoice part paid by transfer used to keep its pay link — the
   * reasoning being that killing it takes away the client's way of sending
   * the rest. It is a fixed-amount Payment Link for the WHOLE invoice, so
   * clicking it sends the whole invoice again on top of what was
   * transferred, and this is the handler that receives that.
   *
   * The link comes down on any recorded payment now, but that only closes it
   * going forward. Every invoice part paid before today still has a live link
   * in the client's inbox, and a client already on the Stripe page when the
   * transfer is recorded can still complete it. This is the last place that
   * can notice, and it noticed nothing: it wrote the payment, marked the
   * invoice paid, and left $2,700 sitting against an $1,800 invoice with
   * every screen reading "Paid".
   */
  it('says so when the money coming in is more than the invoice asked for', async () => {
    // $900 arrived by transfer, then the old pay link took the whole $1,800.
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv_1',
      number: 'BM-2026-0007',
      description: 'Brand photography day',
      lineItems: [],
      amountCents: 180000,
      createdAt: new Date(),
      paidAt: null,
      client: { company: 'Acme', contactName: 'Dana' },
    });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 270000 } });
    constructWebhookEvent.mockReturnValue(completedSession(CUSTOM_METADATA, 180000));

    const res = await POST(request());

    expect(res.status).toBe(200);
    // The money is still recorded — it really arrived, and a webhook that
    // drops it is worse than one that is quiet about it.
    expect(prisma.payment.create).toHaveBeenCalled();
    // But it is said out loud, with the figure, so somebody can give it back.
    const shouted = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(shouted).toContain('BM-2026-0007');
    expect(shouted).toMatch(/\$900/);
  });

  it('stays quiet on an invoice paid exactly once', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv_1',
      number: 'BM-2026-0007',
      description: 'Brand photography day',
      lineItems: [],
      amountCents: 180000,
      createdAt: new Date(),
      paidAt: null,
      client: { company: 'Acme', contactName: 'Dana' },
    });
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 180000 } });
    constructWebhookEvent.mockReturnValue(completedSession(CUSTOM_METADATA, 180000));

    await POST(request());

    const shouted = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(shouted).not.toMatch(/more than/i);
  });

  it('leaves a balance payment unlinked to any invoice', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(BALANCE_METADATA, 150000));

    await POST(request());

    expect(prisma.payment.create.mock.calls[0][0].data.invoiceId).toBeNull();
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Contract-price money that arrives OUTSIDE the instalment flow — the legacy
 * balance link, a manually minted checkout — is applied to the schedule
 * oldest-first, WHOLE ROWS ONLY.
 *
 * Three mutations proved this whole branch was documented and unheld. All 53
 * tests passed with the row-boundary check relaxed to `remaining < 0`, with
 * the redelivery scoping removed from the instalment update, and with the
 * `amount_total` fallback changed — and each still typechecked, so none was
 * passing by breaking the file.
 *
 * The boundary check is the one that costs. Relax it and a client who paid
 * $10,000 of a $12,000 schedule has all three rows stamped paid: the $2,000
 * still owed disappears from the schedule the client sees, from the chase
 * queue, and from every list that would have gone after it. The money is
 * simply written off by arithmetic nobody ran.
 */
describe('money arriving outside the instalment flow', () => {
  const THREE_ROWS = [
    { id: 'i1', index: 1, amountCents: 400_000, status: 'due' },
    { id: 'i2', index: 2, amountCents: 400_000, status: 'scheduled' },
    { id: 'i3', index: 3, amountCents: 400_000, status: 'scheduled' },
  ];

  beforeEach(() => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_9',
      name: 'Acme — Website',
      status: 'build',
      client: { company: 'Acme' },
    });
    prisma.instalment.findMany.mockResolvedValue(THREE_ROWS);
    prisma.instalment.update.mockResolvedValue({});
  });

  const paidRowIds = () =>
    prisma.instalment.update.mock.calls
      .filter((c) => (c[0] as { data: { status?: string } }).data.status === 'paid')
      .map((c) => (c[0] as { where: { id: string } }).where.id);

  it('settles the rows a payment fully covers and stops at the one it does not', async () => {
    // $10,000 against 3 × $4,000: two rows are covered, the third is not.
    constructWebhookEvent.mockReturnValue(completedSession(BALANCE_METADATA, 1_000_000));

    await POST(request());

    expect(paidRowIds()).toEqual(['i1', 'i2']);
  });

  it('settles the whole schedule when the payment covers it', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(BALANCE_METADATA, 1_200_000));

    await POST(request());

    expect(paidRowIds()).toEqual(['i1', 'i2', 'i3']);
  });

  /** Short of even the first row settles nothing, rather than the nearest one. */
  it('settles nothing when the payment covers no row at all', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(BALANCE_METADATA, 150_000));

    await POST(request());

    expect(paidRowIds()).toEqual([]);
    // The money is still recorded — it is allocation that is withheld, not receipt.
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 150_000 });
  });

  it('works oldest-first, so the schedule and the ledger cannot disagree', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(BALANCE_METADATA, 800_000));

    await POST(request());

    // i1 before i2, never i3 before i2.
    expect(paidRowIds()).toEqual(['i1', 'i2']);
  });

  /**
   * A session Stripe hands over with no total. `?? 0` is the deliberate
   * answer: nothing is allocated, because zero covers no row — the opposite
   * of a fallback that guesses.
   */
  it('allocates nothing when Stripe sends no amount at all', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(BALANCE_METADATA, null));

    await POST(request());

    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({ amount: 0 });
    expect(paidRowIds()).toEqual([]);
  });

  it('leaves the schedule alone entirely for a custom charge', async () => {
    constructWebhookEvent.mockReturnValue(
      completedSession({ existingProjectId: 'proj_9', paymentType: 'custom', invoiceId: 'inv_1' }, 1_200_000)
    );

    await POST(request());

    // A one-off charge is priced outside the contracted total, so it may not
    // pay down rows of it however large it is.
    expect(paidRowIds()).toEqual([]);
  });
});

/**
 * An instalment checkout carries its row's id and settles that exact row.
 * Stripe redelivers events, so the update is scoped to a row that is not
 * already paid — otherwise a redelivery days later rewrites `paidAt` and the
 * client's schedule starts claiming the payment landed on the wrong day.
 */
describe('an instalment checkout being redelivered', () => {
  const INST_METADATA = {
    existingProjectId: 'proj_9',
    paymentType: 'balance',
    instalmentId: 'i2',
    invoiceId: 'inv_1',
  };

  beforeEach(() => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'proj_9',
      name: 'Acme — Website',
      status: 'build',
      client: { company: 'Acme' },
    });
    prisma.instalment.updateMany.mockResolvedValue({ count: 1 });
  });

  it('settles the exact row the checkout named', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(INST_METADATA, 400_000));

    await POST(request());

    expect(prisma.instalment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'i2', projectId: 'proj_9' }),
        data: expect.objectContaining({ status: 'paid' }),
      })
    );
    // And does not touch the schedule oldest-first as well.
    expect(prisma.instalment.update).not.toHaveBeenCalled();
  });

  it('scopes the write so a redelivery cannot rewrite when it was paid', async () => {
    constructWebhookEvent.mockReturnValue(completedSession(INST_METADATA, 400_000));

    await POST(request());

    const where = (prisma.instalment.updateMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.status, 'an already-paid row must not match').toEqual({ not: 'paid' });
  });
});
