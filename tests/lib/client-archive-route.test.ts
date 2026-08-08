import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * `PATCH /api/admin/clients/[clientId]` — decommissioning a client, and the
 * only write on that route with consequences outside its own row. It had no
 * tests. Its far more destructive sibling on the same file, DELETE, has a
 * whole one (tests/lib/client-delete-route), which is the wrong way round for
 * how easy the two are to press: DELETE takes a typed company name checked on
 * the server, this took a bare `{ archived: true }` behind one click.
 *
 * `archivedAt` is read as a hard stop in six places. lib/middleware re-checks
 * it on every request, so the client is thrown out of their dashboard
 * mid-session; the login route answers "This account has been
 * decommissioned"; the invoice send route refuses with "reactivate them
 * before chasing this" — the codebase already knowing this is a problem, and
 * only saying so once the money is stuck behind it.
 *
 * So the thing worth pinning is what it refuses.
 */

const prisma = {
  client: { findUnique: vi.fn(), update: vi.fn() },
  project: { count: vi.fn() },
  invoice: { count: vi.fn() },
  teamMessage: { create: vi.fn() },
};

const requireStaff = vi.fn();
const requireRole = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/middleware', () => ({
  requireStaff: () => requireStaff(),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@/lib/authz', () => ({
  ANY_STAFF: ['owner', 'admin', 'sales'],
  requireRole: (...args: unknown[]) => requireRole(...args),
}));
vi.mock('@/lib/deletion-guards', () => ({ accountingHold: () => null }));

const { PATCH } = await import('@/app/api/admin/clients/[clientId]/route');

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
const params = Promise.resolve({ clientId: 'client_1' });
const call = (body: unknown) => PATCH(request(body), { params });

const CLIENT = {
  id: 'client_1',
  company: 'Okafor Plumbing',
  email: 'dana@okafor.co.uk',
  archivedAt: null as Date | null,
};

/** Nothing outstanding — the ordinary case, a finished client being tidied. */
function settled() {
  prisma.project.count.mockResolvedValue(0);
  prisma.invoice.count.mockResolvedValue(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  requireStaff.mockResolvedValue({ userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner' });
  requireRole.mockReturnValue(null);
  prisma.client.findUnique.mockResolvedValue({ ...CLIENT });
  prisma.client.update.mockResolvedValue({ ...CLIENT, archivedAt: new Date() });
  prisma.teamMessage.create.mockResolvedValue({});
  settled();
});

describe('who may use it', () => {
  it('refuses nobody at all', async () => {
    requireStaff.mockResolvedValue(null);

    const res = await call({ archived: true });

    expect(res.status).toBe(401);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('refuses a role the guard turns away', async () => {
    requireRole.mockReturnValue(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));

    const res = await call({ archived: true });

    expect(res.status).toBe(403);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });
});

describe('decommissioning a client who still has work in flight', () => {
  it('refuses while a project is open, and says which', async () => {
    prisma.project.count.mockResolvedValue(1);

    const res = await call({ archived: true });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.liveWork).toEqual({ projects: 1, unpaidInvoices: 0 });
    expect(data.error).toMatch(/1 project still open/);
    // The consequence, not just the count — this is what makes it a decision.
    expect(data.error).toMatch(/locks them out of their dashboard/i);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('refuses while an invoice is unpaid', async () => {
    prisma.invoice.count.mockResolvedValue(2);

    const res = await call({ archived: true });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/2 unpaid invoices/);
    expect(data.error).toMatch(/unsendable/i);
  });

  it('names both when both are true', async () => {
    prisma.project.count.mockResolvedValue(1);
    prisma.invoice.count.mockResolvedValue(3);

    const data = await (await call({ archived: true })).json();

    expect(data.error).toMatch(/1 project still open and 3 unpaid invoices/);
  });

  it('counts only projects that are not complete', async () => {
    await call({ archived: true });

    expect(prisma.project.count).toHaveBeenCalledWith({
      where: { clientId: 'client_1', status: { not: 'complete' } },
    });
  });

  it('counts only invoices that are still open', async () => {
    await call({ archived: true });

    expect(prisma.invoice.count).toHaveBeenCalledWith({
      where: { clientId: 'client_1', status: 'open' },
    });
  });

  /** Named, not forbidden: somebody does walk away mid-build. */
  it('goes through on a second, explicit press', async () => {
    prisma.project.count.mockResolvedValue(1);

    const res = await call({ archived: true, acknowledgeLiveWork: true });

    expect(res.status).toBe(200);
    expect(prisma.client.update).toHaveBeenCalled();
  });
});

describe('decommissioning a client who is finished', () => {
  it('goes straight through', async () => {
    const res = await call({ archived: true });

    expect(res.status).toBe(200);
    expect(prisma.client.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
  });

  it('tells the team it happened', async () => {
    await call({ archived: true });

    expect(prisma.teamMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: expect.stringContaining('Okafor Plumbing') }),
      })
    );
  });

  it('does not announce it twice for a client already decommissioned', async () => {
    prisma.client.findUnique.mockResolvedValue({ ...CLIENT, archivedAt: new Date('2026-08-01') });

    await call({ archived: true });

    expect(prisma.teamMessage.create).not.toHaveBeenCalled();
  });
});

describe('reinstating, and ordinary edits', () => {
  /** Getting a client back in must never be held up by the same check. */
  it('never checks live work when reactivating', async () => {
    prisma.project.count.mockResolvedValue(5);
    prisma.invoice.count.mockResolvedValue(5);
    prisma.client.findUnique.mockResolvedValue({ ...CLIENT, archivedAt: new Date('2026-08-01') });

    const res = await call({ archived: false });

    expect(res.status).toBe(200);
    expect(prisma.client.update.mock.calls[0][0].data.archivedAt).toBeNull();
  });

  it('does not touch archivedAt when the body says nothing about it', async () => {
    const res = await call({ company: 'Okafor Plumbing & Heating' });

    expect(res.status).toBe(200);
    expect(prisma.client.update.mock.calls[0][0].data.archivedAt).toBeUndefined();
  });

  it('does not run the live-work count for a plain edit', async () => {
    await call({ contactName: 'Dana Okafor' });

    expect(prisma.project.count).not.toHaveBeenCalled();
    expect(prisma.invoice.count).not.toHaveBeenCalled();
  });

  it('can clear a phone number, but an empty company is ignored', async () => {
    await call({ phone: '', company: '' });

    const data = prisma.client.update.mock.calls[0][0].data;
    expect(data.phone).toBe('');
    // A falsy company is somebody clearing a required field, not a rename.
    expect(data.company).toBeUndefined();
  });
});
