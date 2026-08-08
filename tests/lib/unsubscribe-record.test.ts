import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The write behind an unsubscribe, which had no tests and was best-effort.
 *
 * Two things were wrong with that, and they compound. The `lead.update` was
 * `.catch(console.error)`, so a failure returned the same `{ found: true }` as
 * a success and both callers reported "That's done — we'll stop." to somebody
 * who was still on the list. And the timeline note was written regardless, so
 * a rep opening the one place this is meant to be explained read "Do not
 * contact by email" beside a lead the sender was still perfectly free to
 * email.
 *
 * A missing follow-up is a lost deal. Ignoring a request to stop is a
 * different category of thing, and it is not one to leave to a console line.
 */

const findUnique = vi.fn();
const update = vi.fn();
const create = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) },
    leadActivity: { create: (...a: unknown[]) => create(...a) },
  },
}));

const { recordUnsubscribe } = await import('@/lib/unsubscribe-record');

beforeEach(() => {
  vi.restoreAllMocks();
  findUnique.mockReset().mockResolvedValue({ id: 'lead_1', doNotContact: false });
  update.mockReset().mockResolvedValue({});
  create.mockReset().mockResolvedValue({});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('somebody asking to be left alone', () => {
  it('marks the lead, with a reason a rep can read', async () => {
    const result = await recordUnsubscribe('tok_1');

    expect(result).toEqual({ found: true, recorded: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead_1' },
        data: expect.objectContaining({ doNotContact: true }),
      })
    );
  });

  it('says so on the timeline as well as in the column', async () => {
    await recordUnsubscribe('tok_1');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ leadId: 'lead_1', type: 'note' }),
      })
    );
  });

  it('is idempotent — a second attempt is not a failure', async () => {
    findUnique.mockResolvedValue({ id: 'lead_1', doNotContact: true });

    const result = await recordUnsubscribe('tok_1');

    expect(result).toEqual({ found: true, recorded: true });
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('when the write does not land', () => {
  it('reports that it did not, instead of the same answer as success', async () => {
    update.mockRejectedValue(new Error('deadlock detected'));

    const result = await recordUnsubscribe('tok_1');

    expect(result).toEqual({ found: true, recorded: false });
  });

  it('does not write a note claiming a stop that did not happen', async () => {
    // The state this prevents: a timeline reading "Do not contact by email"
    // on a lead whose doNotContact is still false, so the sequence carries on
    // and the note is the only thing saying otherwise.
    update.mockRejectedValue(new Error('deadlock detected'));

    await recordUnsubscribe('tok_1');

    expect(create).not.toHaveBeenCalled();
  });

  it('still does not throw at the caller, which is a public route', async () => {
    update.mockRejectedValue(new Error('deadlock detected'));

    await expect(recordUnsubscribe('tok_1')).resolves.toBeTruthy();
  });

  it('survives the timeline note failing on its own — the column is the fact', async () => {
    create.mockRejectedValue(new Error('nope'));

    const result = await recordUnsubscribe('tok_1');

    expect(result).toEqual({ found: true, recorded: true });
  });
});

describe('a token that matches nothing', () => {
  it('is not found, and nothing is written', async () => {
    findUnique.mockResolvedValue(null);

    const result = await recordUnsubscribe('tok_made_up');

    expect(result).toEqual({ found: false, recorded: false });
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('treats a failed lookup the same way rather than throwing', async () => {
    findUnique.mockRejectedValue(new Error('connection lost'));

    await expect(recordUnsubscribe('tok_1')).resolves.toEqual({ found: false, recorded: false });
  });
});
