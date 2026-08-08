import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sending "Payment 2 of 3", which is the one path in the studio that bills a
 * client on a schedule — and had no tests.
 *
 * The invoice-number loop caught every error and treated it as a taken
 * number. lib/billing.ts has a shared allocator that checks for P2002 and
 * rethrows anything else, and its own comment names this route as one of the
 * three call sites it replaced — it did not. So a foreign key violation, a
 * dropped connection, a column that would not take the value, all came back
 * as "Could not allocate an invoice number — try again", with nothing in the
 * log and a person retrying a thing that will never work.
 */

const projectFindUnique = vi.fn();
const invoiceCreate = vi.fn();
const invoiceCount = vi.fn();
const invoiceFindUnique = vi.fn();
const instalmentUpdate = vi.fn();
const instalmentUpdateMany = vi.fn();
const projectUpdateCreate = vi.fn();
const userFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findUnique: (...a: unknown[]) => projectFindUnique(...a) },
    invoice: {
      create: (...a: unknown[]) => invoiceCreate(...a),
      count: (...a: unknown[]) => invoiceCount(...a),
      findUnique: (...a: unknown[]) => invoiceFindUnique(...a),
    },
    instalment: {
      update: (...a: unknown[]) => instalmentUpdate(...a),
      updateMany: (...a: unknown[]) => instalmentUpdateMany(...a),
    },
    projectUpdate: { create: (...a: unknown[]) => projectUpdateCreate(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

const getCurrentSession = vi.fn();
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  getCurrentSession: () => getCurrentSession(),
}));

const ensureInstalments = vi.fn();
vi.mock('@/lib/instalments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instalments')>()),
  ensureInstalments: (...a: unknown[]) => ensureInstalments(...a),
}));

const sendInstalmentEmail = vi.fn();
vi.mock('@/lib/email', () => ({
  sendInstalmentEmail: (...a: unknown[]) => sendInstalmentEmail(...a),
}));

vi.mock('@/lib/invoice-pdf', () => ({ buildInstalmentInvoicePdf: async () => new Uint8Array([1]) }));

const checkoutCreate = vi.fn();
const sessionExpire = vi.fn();
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: (...a: unknown[]) => checkoutCreate(...a), expire: (...a: unknown[]) => sessionExpire(...a) } };
  },
}));

const { POST } = await import('@/app/api/admin/projects/[projectId]/instalments/route');

function request(payload: unknown) {
  return { json: async () => payload } as Parameters<typeof POST>[0];
}
const ctx = { params: Promise.resolve({ projectId: 'p_1' }) };

const INSTALMENTS = [
  { id: 'i_0', index: 0, label: 'Deposit', amountCents: 483_333, percent: 33, trigger: 'signing',
    status: 'paid', dueAt: null, invoicedAt: null, invoiceNumber: null, stripeSessionId: null, emailSentAt: null },
  { id: 'i_1', index: 1, label: 'Payment 2 of 3', amountCents: 483_333, percent: 33, trigger: 'design-approval',
    status: 'scheduled', dueAt: null, invoicedAt: null, invoiceNumber: null, stripeSessionId: null, emailSentAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  getCurrentSession.mockResolvedValue({ type: 'user', userId: 'u_kiana', role: 'owner', iat: 2_000_000_000 });
  userFindUnique.mockResolvedValue({ sessionsValidFrom: null, role: 'owner' });
  // statusStage 2 = Build, so the design-approval gate is behind us.
  projectFindUnique.mockResolvedValue({
    id: 'p_1',
    name: 'Northgate — Website',
    status: 'build',
    statusStage: 2,
    totalPrice: 1_450_000,
    clientId: 'c_1',
    client: { id: 'c_1', company: 'Northgate Dental', contactName: 'Dana', email: 'dana@northgate.test' },
  });
  ensureInstalments.mockResolvedValue(INSTALMENTS);
  invoiceCount.mockResolvedValue(30);
  invoiceCreate.mockResolvedValue({ id: 'inv_1', number: 'BM-2026-0031', createdAt: new Date() });
  invoiceFindUnique.mockResolvedValue(null);
  instalmentUpdateMany.mockResolvedValue({ count: 1 });
  instalmentUpdate.mockResolvedValue({});
  projectUpdateCreate.mockResolvedValue({});
  checkoutCreate.mockResolvedValue({ id: 'cs_1', url: 'https://pay.test/cs_1' });
  sendInstalmentEmail.mockResolvedValue({ sent: true, reason: null });
});

describe('allocating the invoice number', () => {
  it('retries past a number somebody else took', async () => {
    const taken = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    invoiceCreate.mockRejectedValueOnce(taken);

    const res = await POST(request({ index: 1 }), ctx);

    expect(res.status).toBe(200);
    expect(invoiceCreate).toHaveBeenCalledTimes(2);
  });

  /*
   * The one the bare `catch` hid. A failure that has nothing to do with the
   * number came back as a numbering problem — so the sentence on screen sent
   * somebody to retry a thing that will fail identically every time, and the
   * actual error was never logged.
   */
  it('does not report an unrelated database failure as a numbering problem', async () => {
    invoiceCreate.mockRejectedValue(
      Object.assign(new Error('Foreign key constraint failed on the field: `clientId`'), { code: 'P2003' })
    );

    const res = await POST(request({ index: 1 }), ctx);
    const body = await res.json();

    expect(body.error).not.toMatch(/allocate an invoice number/i);
    // Tried once and stopped, rather than hammering a failure five times.
    expect(invoiceCreate).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('still gives up gracefully when the number really is contended', async () => {
    invoiceCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    const res = await POST(request({ index: 1 }), ctx);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('invoice number'),
    });
  });
});

describe('the guards that were already there', () => {
  it('refuses to send before the gate, unless acknowledged', async () => {
    projectFindUnique.mockResolvedValue({
      id: 'p_1', name: 'Northgate — Website', status: 'design', statusStage: 1,
      totalPrice: 1_450_000, clientId: 'c_1',
      client: { id: 'c_1', company: 'Northgate Dental', contactName: 'Dana', email: 'dana@northgate.test' },
    });

    const res = await POST(request({ index: 1 }), ctx);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ gateNotReached: true });
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it('refuses to skip ahead of an unpaid earlier payment', async () => {
    ensureInstalments.mockResolvedValue([
      { ...INSTALMENTS[0], status: 'due' },
      INSTALMENTS[1],
    ]);

    const res = await POST(request({ index: 1 }), ctx);

    expect(res.status).toBe(400);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it('refuses when somebody else is already sending it', async () => {
    instalmentUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(request({ index: 1 }), ctx);

    expect(res.status).toBe(409);
    expect(checkoutCreate).not.toHaveBeenCalled();
  });
});
