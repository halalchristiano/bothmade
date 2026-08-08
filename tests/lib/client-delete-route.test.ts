import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deleting a client, which is the largest cascade in the schema: every
 * project, and through each project the messages, updates, notes, onboarding,
 * instalments, change orders, design feedback and invoices.
 *
 * Two things were missing, and together they made this the way around the
 * guard on projects. The typed company name lived only in the browser, on a
 * disabled button — the route accepted a bare DELETE with no body at all. And
 * nothing checked for accounting records, so the project that refuses to
 * delete because money is recorded against it deleted fine, with the money,
 * if you deleted its client instead.
 */

const clientFindUnique = vi.fn();
const clientDelete = vi.fn();
const paymentCount = vi.fn();
const userFindUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findUnique: (...a: unknown[]) => clientFindUnique(...a),
      delete: (...a: unknown[]) => clientDelete(...a),
    },
    payment: { count: (...a: unknown[]) => paymentCount(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

const getCurrentSession = vi.fn();
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  getCurrentSession: () => getCurrentSession(),
}));

const { DELETE } = await import('@/app/api/admin/clients/[clientId]/route');

/** A request whose body is whatever was passed, or none at all. */
function request(payload?: unknown) {
  return {
    json: async () => {
      if (payload === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return payload;
    },
  } as Parameters<typeof DELETE>[0];
}
const ctx = { params: Promise.resolve({ clientId: 'c_1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getCurrentSession.mockResolvedValue({ type: 'user', userId: 'u_kiana', role: 'owner', iat: 2_000_000_000 });
  userFindUnique.mockResolvedValue({ sessionsValidFrom: null, role: 'owner' });
  clientFindUnique.mockResolvedValue({
    id: 'c_1',
    company: 'Northgate Dental',
    _count: { invoices: 0, projects: 2 },
  });
  clientDelete.mockResolvedValue({ id: 'c_1' });
  paymentCount.mockResolvedValue(0);
});

describe('a delete that asks for nothing', () => {
  it('is refused when the request carries no body at all', async () => {
    const res = await DELETE(request(), ctx);

    expect(res.status).toBe(400);
    expect(clientDelete).not.toHaveBeenCalled();
  });

  it('is refused when the typed name is not the company', async () => {
    const res = await DELETE(request({ confirm: 'yes' }), ctx);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('Northgate Dental'),
    });
    expect(clientDelete).not.toHaveBeenCalled();
  });

  it('goes ahead once the company name is typed, in any capitalisation', async () => {
    const res = await DELETE(request({ confirm: '  northgate dental ' }), ctx);

    expect(res.status).toBe(200);
    expect(clientDelete).toHaveBeenCalledWith({ where: { id: 'c_1' } });
  });
});

describe('the accounting records the cascade would have taken', () => {
  it('refuses when a payment exists on any of their projects', async () => {
    paymentCount.mockResolvedValue(3);

    const res = await DELETE(request({ confirm: 'Northgate Dental' }), ctx);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('3 payments'),
    });
    expect(clientDelete).not.toHaveBeenCalled();
  });

  it('counts payments across the projects, since they do not hang off the client', async () => {
    await DELETE(request({ confirm: 'Northgate Dental' }), ctx);

    expect(paymentCount).toHaveBeenCalledWith({ where: { project: { clientId: 'c_1' } } });
  });

  it('refuses when an invoice was raised, paid or not', async () => {
    clientFindUnique.mockResolvedValue({
      id: 'c_1',
      company: 'Northgate Dental',
      _count: { invoices: 1, projects: 1 },
    });

    const res = await DELETE(request({ confirm: 'Northgate Dental' }), ctx);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('1 invoice'),
    });
    expect(clientDelete).not.toHaveBeenCalled();
  });

  it('points at Decommission, which is the thing they actually wanted', async () => {
    paymentCount.mockResolvedValue(1);

    const res = await DELETE(request({ confirm: 'Northgate Dental' }), ctx);
    const body = await res.json();

    expect(body.error).toContain('Decommission');
  });

  /*
   * A client with projects but no money against them is exactly the case this
   * is for: test data, a duplicate record, an onboarding that never went
   * anywhere. Those still delete.
   */
  it('still deletes a client whose projects never took money', async () => {
    const res = await DELETE(request({ confirm: 'Northgate Dental' }), ctx);

    expect(res.status).toBe(200);
    expect(clientDelete).toHaveBeenCalled();
  });
});

describe('who may ask', () => {
  it('refuses a caller who is not signed in as staff', async () => {
    getCurrentSession.mockResolvedValue(null);

    const res = await DELETE(request({ confirm: 'Northgate Dental' }), ctx);

    expect(res.status).toBe(401);
    expect(clientDelete).not.toHaveBeenCalled();
  });
});
