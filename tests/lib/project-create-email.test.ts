import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * The one door where a member of staff creates a paying client by hand.
 *
 * The address typed into it is not a contact detail. It is the client's
 * login, the `to:` on every invoice, and the unique key their Client row is
 * found by — and it was taken exactly as typed, checked only for being
 * non-empty.
 *
 * Two failures came out of that, both silent. A typo produced a client who
 * cannot sign in and never receives an invoice, and the only symptom is
 * nothing being heard from somebody who has already paid. And case: stored
 * verbatim, "Dana@Okafor.co.uk" today and "dana@okafor.co.uk" next month are
 * two Client rows with the projects split between them, while signup and
 * password-reset have always lowercased.
 *
 * The public contact form has run isValidEmail since it was written. This did
 * not.
 */

const prisma = {
  client: { findUnique: vi.fn(), create: vi.fn() },
  project: { create: vi.fn(), update: vi.fn() },
  projectUpdate: { create: vi.fn() },
  lead: { findUnique: vi.fn(), update: vi.fn() },
  emailPreferences: { create: vi.fn() },
  instalment: { createMany: vi.fn() },
  $transaction: vi.fn(),
};

const sendWelcomeEmail = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/email', () => ({ sendWelcomeEmail: (...a: unknown[]) => sendWelcomeEmail(...a) }));
vi.mock('@/lib/auth', () => ({
  generateRandomPassword: () => 'generated-password',
  hashPassword: async (p: string) => `hashed:${p}`,
}));
vi.mock('@/lib/middleware', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/middleware')>()),
  requireStaff: async () => ({ userId: 'u1', email: 'kiana@bothmade.studio', role: 'owner', type: 'user' }),
  canOverridePricing: () => true,
}));
vi.mock('@/lib/authz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/authz')>()),
  requireRole: () => null,
}));

const { POST } = await import('@/app/api/admin/projects/create/route');

function request(body: unknown): NextRequest {
  return { json: async () => body, headers: { get: () => null } } as unknown as NextRequest;
}

const VALID = {
  clientEmail: 'dana@okafor.co.uk',
  company: 'Okafor Plumbing',
  contactName: 'Dana Okafor',
  baseService: 'website',
  clientType: 'smb',
  timeline: 'standard',
  addOns: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.client.findUnique.mockResolvedValue(null);
  prisma.client.create.mockResolvedValue({ id: 'c1', email: VALID.clientEmail });
  prisma.project.create.mockResolvedValue({ id: 'p1', name: 'Okafor Plumbing Site', totalPrice: 500000 });
  prisma.project.update.mockResolvedValue({});
  prisma.projectUpdate.create.mockResolvedValue({});
  prisma.lead.findUnique.mockResolvedValue(null);
  prisma.lead.update.mockResolvedValue({});
  prisma.emailPreferences.create.mockResolvedValue({});
  prisma.instalment.createMany.mockResolvedValue({ count: 3 });
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : arg
  );
  sendWelcomeEmail.mockResolvedValue(true);
});

describe('the address a client will log in with', () => {
  it.each([
    ['no TLD', 'dana@okafor'],
    ['no @ at all', 'dana.okafor.co.uk'],
    ['a space in the middle', 'dana okafor@example.com'],
    ['nothing but an @', '@'],
  ])('refuses %s', async (_label, clientEmail) => {
    const res = await POST(request({ ...VALID, clientEmail }));

    expect(res.status).toBe(400);
    // Nothing written: a client row with an unreachable address is worse
    // than a refused form, because nobody finds out for weeks.
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('stores it folded to lower case', async () => {
    await POST(request({ ...VALID, clientEmail: '  Dana@Okafor.CO.UK  ' }));

    expect(prisma.client.create.mock.calls[0][0].data.email).toBe('dana@okafor.co.uk');
  });

  it('looks for an existing client by the folded address, not the typed one', async () => {
    await POST(request({ ...VALID, clientEmail: 'Dana@Okafor.CO.UK' }));

    // Otherwise the same person typed with different capitals becomes a
    // second Client row, and their projects are split across the two.
    expect(prisma.client.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'dana@okafor.co.uk' } })
    );
  });

  it('sends the credentials to the address the login will match on', async () => {
    await POST(request({ ...VALID, clientEmail: 'Dana@Okafor.CO.UK' }));

    // A welcome email naming an address that is not what was stored is a set
    // of credentials that cannot be used.
    expect(sendWelcomeEmail).toHaveBeenCalled();
    expect(sendWelcomeEmail.mock.calls[0][0]).toBe('dana@okafor.co.uk');
  });

  it('still accepts an ordinary address', async () => {
    const res = await POST(request(VALID));

    expect(res.status).toBeLessThan(400);
    expect(prisma.client.create).toHaveBeenCalled();
  });
});
