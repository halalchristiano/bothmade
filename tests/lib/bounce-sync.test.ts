import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Which of the emails we sent came back, and which of them got an answer.
 *
 * Two hundred and thirty lines with no test of any kind until now, feeding a
 * band on the call queue and a nightly cron. Two mutations proved it: delete
 * the status guard so a reply demotes a qualified lead back to "replied", and
 * delete the `emailDeliveryFailedAt: null` filter so every nightly run
 * re-dates bounces dealt with weeks ago. Both survived the whole suite.
 *
 * What is pinned here is what a rep would actually notice going wrong:
 *
 *  - A dead address is flagged once and stays where it was put. The nightly
 *    job runs over the same mailbox every night; if it re-dated old bounces
 *    the queue's "bounced" band would refill every morning with addresses
 *    somebody already dealt with, and stop meaning anything.
 *  - A reply beats a bounce. If a lead writes back the address plainly works,
 *    so whatever flagged it earlier was wrong or has since been fixed.
 *  - A reply advances a cold lead and never drags a warm one backwards.
 *    Demoting a qualified lead to "replied" would move it in the pipeline and
 *    in every forecast weighted off stage.
 *  - One broken mailbox does not stop the others being scanned, because the
 *    whole point of the nightly pass is that nobody has to think about it.
 */

const prisma = {
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  lead: { findMany: vi.fn(), updateMany: vi.fn() },
};

const decryptSecret = vi.fn();
const scanBouncedAddresses = vi.fn();
const scanReplyAddresses = vi.fn();
const createGmailOAuthBatchClient = vi.fn(() => ({ client: true }));

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/crypto', () => ({ decryptSecret: (v: string) => decryptSecret(v) }));
vi.mock('@/lib/gmail-oauth', () => ({
  createGmailOAuthBatchClient: (...a: unknown[]) => createGmailOAuthBatchClient(...a),
  scanBouncedAddresses: (...a: unknown[]) => scanBouncedAddresses(...a),
  scanReplyAddresses: (...a: unknown[]) => scanReplyAddresses(...a),
}));

const { syncBouncesForUser, syncRepliesForUser, syncBouncesForAllUsers } = await import(
  '@/lib/bounce-sync'
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});

  prisma.user.findUnique.mockResolvedValue({ googleRefreshToken: 'enc:token' });
  prisma.user.update.mockResolvedValue({});
  prisma.lead.findMany.mockResolvedValue([]);
  prisma.lead.updateMany.mockResolvedValue({ count: 0 });
  decryptSecret.mockReturnValue('refresh-token');
  scanBouncedAddresses.mockResolvedValue({ ok: true, scanned: 12, addresses: [] });
  scanReplyAddresses.mockResolvedValue({ ok: true, scanned: 12, addresses: [] });
});

const found = (...leads: Array<{ id: string; company: string }>) =>
  prisma.lead.findMany.mockResolvedValue(leads);

/** The `where` of the nth lead.updateMany call. */
const updateWhere = (n = 0) => prisma.lead.updateMany.mock.calls[n][0].where;
const updateData = (n = 0) => prisma.lead.updateMany.mock.calls[n][0].data;

describe('a bounced address', () => {
  it('flags the leads it belongs to, and says which companies', async () => {
    scanBouncedAddresses.mockResolvedValue({ ok: true, scanned: 40, addresses: ['a@dead.test'] });
    found({ id: 'lead_1', company: 'Brandon Roofing' });

    const result = await syncBouncesForUser('user_1');

    expect(result).toMatchObject({ ok: true, scanned: 40, flagged: 1, companies: ['Brandon Roofing'] });
    expect(updateData()).toMatchObject({ emailDeliveryFailedAt: expect.any(Date) });
    expect(updateData().emailDeliveryFailedReason).toContain('Call them instead');
  });

  /**
   * THE MUTATION THAT SURVIVED. The nightly job re-reads the same mailbox
   * every night. Without this filter it re-dates bounces dealt with weeks ago,
   * and the queue's bounced band refills every morning with old news until
   * nobody reads it.
   */
  it('is only flagged once — a re-run leaves an old bounce where it was put', async () => {
    scanBouncedAddresses.mockResolvedValue({ ok: true, scanned: 40, addresses: ['a@dead.test'] });

    await syncBouncesForUser('user_1');

    expect(prisma.lead.findMany.mock.calls[0][0].where).toMatchObject({
      emailDeliveryFailedAt: null,
    });
  });

  it('leaves closed deals alone', async () => {
    scanBouncedAddresses.mockResolvedValue({ ok: true, scanned: 40, addresses: ['a@dead.test'] });

    await syncBouncesForUser('user_1');

    expect(prisma.lead.findMany.mock.calls[0][0].where.status).toEqual({ notIn: ['won', 'lost'] });
  });

  it('matches the address however it was capitalised', async () => {
    scanBouncedAddresses.mockResolvedValue({ ok: true, scanned: 1, addresses: ['A@Dead.Test'] });

    await syncBouncesForUser('user_1');

    expect(prisma.lead.findMany.mock.calls[0][0].where.email).toMatchObject({ mode: 'insensitive' });
  });

  it('writes nothing when the scan comes back empty', async () => {
    await syncBouncesForUser('user_1');

    expect(prisma.lead.findMany).not.toHaveBeenCalled();
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });
});

describe('a reply', () => {
  const replied = (leads: Array<{ id: string; company: string }>) => {
    scanReplyAddresses.mockResolvedValue({ ok: true, scanned: 20, addresses: ['them@real.test'] });
    found(...leads);
  };

  /**
   * A reply is proof the address works, so it has to undo a bounce flag — or
   * a lead who wrote back sits in the "bounced, call them instead" band with a
   * working inbox nobody is using.
   */
  it('clears an earlier bounce, because the address plainly works', async () => {
    replied([{ id: 'lead_1', company: 'Brandon Roofing' }]);

    await syncRepliesForUser('user_1');

    expect(updateData()).toMatchObject({
      replyReceivedAt: expect.any(Date),
      emailDeliveryFailedAt: null,
      emailDeliveryFailedReason: null,
    });
  });

  it('advances a cold lead to replied', async () => {
    replied([{ id: 'lead_1', company: 'Brandon Roofing' }]);

    await syncRepliesForUser('user_1');

    expect(updateWhere(1).status).toEqual({ in: ['new', 'researched', 'contacted'] });
    expect(updateData(1)).toEqual({ status: 'replied' });
  });

  /**
   * THE OTHER MUTATION THAT SURVIVED. Without the status guard the second
   * write applies to everything matched, so a lead already at "qualified" or
   * "proposal sent" answering an email drags it back to "replied" — moving it
   * in the pipeline and in every forecast weighted off stage.
   */
  it('never drags a warmer lead backwards', async () => {
    replied([{ id: 'lead_1', company: 'Brandon Roofing' }]);

    await syncRepliesForUser('user_1');

    const promotion = prisma.lead.updateMany.mock.calls.find(
      (c) => c[0].data?.status === 'replied'
    );
    expect(promotion, 'the promotion must be guarded by current status').toBeTruthy();
    expect(promotion![0].where.status).toBeTruthy();
  });

  it('is only counted once — a second reply does not reset the clock', async () => {
    replied([{ id: 'lead_1', company: 'Brandon Roofing' }]);

    await syncRepliesForUser('user_1');

    expect(prisma.lead.findMany.mock.calls[0][0].where).toMatchObject({ replyReceivedAt: null });
  });
});

describe('a mailbox that will not open', () => {
  it('says so rather than throwing, when no Google account is connected', async () => {
    prisma.user.findUnique.mockResolvedValue({ googleRefreshToken: null });

    const result = await syncBouncesForUser('user_1');

    expect(result).toMatchObject({ ok: false, flagged: 0, error: 'No Google account connected.' });
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('says so when the stored token cannot be decrypted', async () => {
    decryptSecret.mockImplementation(() => {
      throw new Error('bad key');
    });

    const result = await syncBouncesForUser('user_1');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('could not be read');
  });

  /**
   * The flag the settings screen reads to say "reconnect Gmail". A token
   * minted before reading was needed can still send, so nothing looks broken
   * while bounce detection sits silently dead.
   */
  it('records that the mailbox needs reconnecting', async () => {
    scanBouncedAddresses.mockResolvedValue({ ok: false, needsReconnect: true, error: 'no scope' });

    const result = await syncBouncesForUser('user_1');

    expect(result.needsReconnect).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { gmailNeedsReconnect: true },
    });
  });

  /** A read that worked proves the scope is there, whatever we thought before. */
  it('clears the flag as soon as a read succeeds', async () => {
    await syncBouncesForUser('user_1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { gmailNeedsReconnect: false },
    });
  });
});

describe('the nightly pass over every mailbox', () => {
  /**
   * The whole point of the automatic run is that nobody has to think about
   * it, so one revoked token must not quietly stop the other mailbox being
   * scanned for the rest of the week.
   */
  it('keeps going when one mailbox fails', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user_1', email: 'evan@bothmade.studio' },
      { id: 'user_2', email: 'kiana@bothmade.studio' },
    ]);
    prisma.user.findUnique
      .mockResolvedValueOnce({ googleRefreshToken: null }) // user_1: not connected
      .mockResolvedValueOnce({ googleRefreshToken: 'enc:token' });
    scanBouncedAddresses.mockResolvedValue({ ok: true, scanned: 7, addresses: ['a@dead.test'] });
    found({ id: 'lead_9', company: 'Second Co' });

    const result = await syncBouncesForAllUsers();

    expect(result).toEqual({ scanned: 7, flagged: 1 });
  });

  it('survives a mailbox that throws outright', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'user_1', email: 'evan@bothmade.studio' },
      { id: 'user_2', email: 'kiana@bothmade.studio' },
    ]);
    prisma.user.findUnique
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ googleRefreshToken: 'enc:token' });
    scanBouncedAddresses.mockResolvedValue({ ok: true, scanned: 3, addresses: [] });

    await expect(syncBouncesForAllUsers()).resolves.toEqual({ scanned: 3, flagged: 0 });
  });

  it('only asks mailboxes that are actually connected', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await syncBouncesForAllUsers();

    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      googleRefreshToken: { not: null },
    });
  });
});
