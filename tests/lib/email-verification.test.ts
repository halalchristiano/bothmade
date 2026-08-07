import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Checking an address before sending to it.
 *
 * Three quarters of this book carries an `info@` worked out from a domain
 * rather than one anybody saw published, and every wrong guess is a hard
 * bounce. What is pinned here is mostly what the module must NOT do: never
 * invent a verdict, never treat "not checked" as "bad", and never let a
 * missing API key break sending for an app that worked before any of this
 * existed.
 */

const {
  VERIFY_BATCH_SIZE,
  isSendableStatus,
  isVerifiedGood,
  isVerificationConfigured,
  remainingCredits,
  verifyBatch,
} = await import('@/lib/email-verification');

const KEY = 'zb_test_key';
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ZEROBOUNCE_API_KEY = KEY;
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  delete process.env.ZEROBOUNCE_API_KEY;
  vi.unstubAllGlobals();
});

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe('which verdicts may be sent to', () => {
  /**
   * A spamtrap never bounces to warn you — it exists to catch senders who did
   * not check, and hitting one is the fastest route to a domain blocklist.
   */
  it('refuses the four that are worse than a bounce', () => {
    for (const s of ['invalid', 'spamtrap', 'abuse', 'do_not_mail']) {
      expect(isSendableStatus(s), s).toBe(false);
    }
  });

  /**
   * A catch-all domain accepts everything, so the verifier genuinely cannot
   * tell — and most small businesses run one, which is most of this book.
   * Refusing them would throw away more real prospects than bounces saved.
   */
  it('allows the two that are uncertain rather than bad', () => {
    expect(isSendableStatus('catch-all')).toBe(true);
    expect(isSendableStatus('unknown')).toBe(true);
  });

  /** Never checked is not the same as checked and bad. */
  it('allows an address nothing has been said about', () => {
    expect(isSendableStatus(null)).toBe(true);
    expect(isSendableStatus(undefined)).toBe(true);
  });

  it('calls only a confirmed mailbox good', () => {
    expect(isVerifiedGood('valid')).toBe(true);
    for (const s of ['catch-all', 'unknown', 'invalid', null]) {
      expect(isVerifiedGood(s), String(s)).toBe(false);
    }
  });
});

describe('without an API key', () => {
  it('reports itself switched off rather than pretending', () => {
    delete process.env.ZEROBOUNCE_API_KEY;
    expect(isVerificationConfigured()).toBe(false);
  });

  it('refuses to verify rather than returning a confident empty answer', async () => {
    delete process.env.ZEROBOUNCE_API_KEY;
    await expect(verifyBatch(['a@b.com'])).rejects.toThrow(/not configured/i);
  });

  it('answers null for credits instead of throwing', async () => {
    delete process.env.ZEROBOUNCE_API_KEY;
    expect(await remainingCredits()).toBeNull();
  });
});

describe('verifying a batch', () => {
  it('sends the addresses in the shape the provider expects', async () => {
    fetchMock.mockResolvedValue(ok({ email_batch: [] }));

    await verifyBatch(['A@Example.com', 'b@example.com']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v2/validatebatch');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.api_key).toBe(KEY);
    expect(body.email_batch).toEqual([
      { email_address: 'A@Example.com', ip_address: null },
      { email_address: 'b@example.com', ip_address: null },
    ]);
  });

  it('keys results by lowercased address, whatever case came back', async () => {
    fetchMock.mockResolvedValue(
      ok({ email_batch: [{ address: 'Dana@Ridgeline.com', status: 'valid', sub_status: '' }] })
    );

    const out = await verifyBatch(['Dana@Ridgeline.com']);

    expect(out.get('dana@ridgeline.com')?.status).toBe('valid');
    expect(out.get('dana@ridgeline.com')?.subStatus).toBeNull();
  });

  /**
   * The rule the whole thing rests on: an address the provider said nothing
   * about must come back absent, so the caller leaves it unverified rather
   * than recording a verdict nobody gave.
   */
  it('leaves out an address it got no verdict for', async () => {
    fetchMock.mockResolvedValue(
      ok({
        email_batch: [
          { address: 'good@x.com', status: 'valid' },
          { address: 'broken@x.com', error: 'something went wrong' },
          { status: 'valid' },
        ],
      })
    );

    const out = await verifyBatch(['good@x.com', 'broken@x.com', 'c@x.com']);

    expect([...out.keys()]).toEqual(['good@x.com']);
  });

  it('keeps the sub-status verbatim for explaining a surprise later', async () => {
    fetchMock.mockResolvedValue(
      ok({ email_batch: [{ address: 'a@b.com', status: 'invalid', sub_status: 'mailbox_not_found' }] })
    );

    expect((await verifyBatch(['a@b.com'])).get('a@b.com')?.subStatus).toBe('mailbox_not_found');
  });

  /** Silence about a failure reads exactly like "everything is fine". */
  it('throws on a transport failure rather than answering nothing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

    await expect(verifyBatch(['a@b.com'])).rejects.toThrow(/HTTP 500/);
  });

  it('refuses more than the provider accepts in one call', async () => {
    const many = Array.from({ length: VERIFY_BATCH_SIZE + 1 }, (_, i) => `a${i}@b.com`);

    await expect(verifyBatch(many)).rejects.toThrow(/at most/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call out at all for an empty list', async () => {
    expect((await verifyBatch([])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('credits', () => {
  it('reads the balance', async () => {
    fetchMock.mockResolvedValue(ok({ Credits: '1420' }));
    expect(await remainingCredits()).toBe(1420);
  });

  /** The API answers -1 for a bad key, which is not a balance of minus one. */
  it('treats the invalid-key sentinel as unknown', async () => {
    fetchMock.mockResolvedValue(ok({ Credits: '-1' }));
    expect(await remainingCredits()).toBeNull();
  });

  it('stays quiet when the call fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await remainingCredits()).toBeNull();
  });
});
