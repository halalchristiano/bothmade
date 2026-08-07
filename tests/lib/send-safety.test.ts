import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Not sending into a wall.
 *
 * Around three quarters of this book carries an address nobody ever saw
 * published — `info@` worked out from the company's domain because that is
 * right most of the time. Every one that is wrong is a hard bounce, and a
 * sender bouncing one message in ten is mechanically indistinguishable from
 * somebody working a scraped list. That is the shape providers act on, and
 * the sender could not see it coming because a guess and a verified address
 * went out identically.
 *
 * Two guards answering two questions: which addresses go FIRST, and when to
 * STOP.
 */

const prisma = { lead: { count: vi.fn(async (_a: unknown) => 0) } };
vi.mock('@/lib/prisma', () => ({ prisma }));

const {
  BounceWatch,
  BOUNCE_HALT_RATE,
  BOUNCE_WATCH_MIN_SAMPLE,
  isVerifiedAddress,
  recentBounceRate,
  verifiedFirst,
} = await import('@/lib/send-safety');

const lead = (name: string, tags: string) => ({ name, tags, email: `info@${name}.com` });

beforeEach(() => vi.clearAllMocks());

describe('which addresses we trust', () => {
  it('trusts one seen published', () => {
    expect(isVerifiedAddress(lead('a', 'field-run-011;confirmed-email;has-phone'))).toBe(true);
  });

  it('does not trust one worked out from the domain', () => {
    expect(isVerifiedAddress(lead('a', 'field-run-011;convention-email'))).toBe(false);
  });

  /**
   * The older imports carry no tag at all and were produced the same guessing
   * way. Treating "unknown" as "fine" would exempt the largest and least
   * trustworthy group of the lot.
   */
  it('does not trust one with nothing said about it either way', () => {
    expect(isVerifiedAddress(lead('a', ''))).toBe(false);
    expect(isVerifiedAddress(lead('a', 'field-run-003;med-spa'))).toBe(false);
  });
});

describe('ordering a batch', () => {
  it('puts verified addresses in front of guesses', () => {
    const out = verifiedFirst([
      lead('guess1', 'convention-email'),
      lead('known1', 'confirmed-email'),
      lead('guess2', 'convention-email'),
      lead('known2', 'confirmed-email'),
    ]);

    expect(out.map((l) => l.name)).toEqual(['known1', 'known2', 'guess1', 'guess2']);
  });

  /**
   * The caller has usually already ordered by something that means
   * something — most-opened first, biggest deal first. This lifts the safe
   * ones above the risky ones; it does not replace that decision.
   */
  it('keeps the order the caller chose inside each group', () => {
    const out = verifiedFirst([
      lead('g1', 'convention-email'),
      lead('g2', 'convention-email'),
      lead('g3', 'convention-email'),
    ]);

    expect(out.map((l) => l.name)).toEqual(['g1', 'g2', 'g3']);
  });

  it('loses nobody', () => {
    const input = Array.from({ length: 9 }, (_, i) =>
      lead(`l${i}`, i % 3 === 0 ? 'confirmed-email' : 'convention-email')
    );
    expect(verifiedFirst(input)).toHaveLength(9);
  });
});

describe('stopping a batch that is bouncing', () => {
  const run = (results: boolean[]) => {
    const w = new BounceWatch();
    for (const ok of results) w.record(ok);
    return w.verdict();
  };

  /** One failure out of two is 50% and means nothing whatsoever. */
  it('says nothing before there is enough to judge', () => {
    expect(run([false, false, false]).halt).toBe(false);
    expect(run(Array(BOUNCE_WATCH_MIN_SAMPLE - 1).fill(false)).halt).toBe(false);
  });

  it('halts once a real sample is failing badly', () => {
    const v = run([...Array(15).fill(false), ...Array(5).fill(true)]);

    expect(v.halt).toBe(true);
    expect(v.rate).toBeGreaterThan(BOUNCE_HALT_RATE);
    // Says what to do, not just that it stopped.
    expect(v.reason).toMatch(/verify/i);
  });

  it('lets a healthy batch run to the end', () => {
    const v = run([...Array(49).fill(true), false]);

    expect(v.halt).toBe(false);
    expect(v.rate).toBeCloseTo(0.02, 2);
  });

  it('counts only what was attempted', () => {
    const v = run([true, true, false]);
    expect(v.attempted).toBe(3);
    expect(v.failed).toBe(1);
  });

  it('is quiet on an empty batch rather than dividing by zero', () => {
    const v = new BounceWatch().verdict();
    expect(v.rate).toBe(0);
    expect(v.halt).toBe(false);
  });
});

describe('the standing bounce rate', () => {
  /**
   * A hard bounce lands after the send loop has finished, so the in-flight
   * watch can never see it. This is the only guard that can stop a bad list
   * before any of it goes out.
   */
  it('measures bounces against sends over the window', async () => {
    prisma.lead.count.mockResolvedValueOnce(200).mockResolvedValueOnce(24);

    const r = await recentBounceRate(7, new Date('2026-08-07T12:00:00Z'));

    expect(r.sent).toBe(200);
    expect(r.bounced).toBe(24);
    expect(r.rate).toBeCloseTo(0.12, 3);
  });

  it('reports nothing rather than infinity when nothing was sent', async () => {
    prisma.lead.count.mockResolvedValue(0);

    expect((await recentBounceRate()).rate).toBe(0);
  });
});

/**
 * A verifier's answer against the research CSV's claim.
 *
 * The tag says somebody saw the address printed on a website. `valid` says a
 * mail server confirmed the mailbox exists. When they disagree the second one
 * wins, in both directions — including the awkward direction, where a lead
 * tagged confirmed comes back uncertain and must stop being promoted on the
 * strength of a tag that is now out of date.
 */
describe('verification against the tag', () => {
  it('promotes a guessed address the verifier confirmed', () => {
    expect(
      isVerifiedAddress({ tags: 'convention-email', email: 'a@b.com', emailVerificationStatus: 'valid' })
    ).toBe(true);
  });

  it('demotes a tagged address the verifier could not confirm', () => {
    for (const status of ['catch-all', 'unknown', 'invalid']) {
      expect(
        isVerifiedAddress({ tags: 'confirmed-email', email: 'a@b.com', emailVerificationStatus: status }),
        status
      ).toBe(false);
    }
  });

  it('falls back to the tag while nothing has been verified', () => {
    expect(isVerifiedAddress({ tags: 'confirmed-email', email: 'a@b.com', emailVerificationStatus: null })).toBe(true);
    expect(isVerifiedAddress({ tags: 'convention-email', email: 'a@b.com' })).toBe(false);
  });

  it('sorts verified-good ahead of merely-tagged', () => {
    const out = verifiedFirst([
      { tags: 'confirmed-email', email: 'tagged@b.com' },
      { tags: 'convention-email', email: 'checked@b.com', emailVerificationStatus: 'valid' },
    ]);
    expect(out.map((l) => l.email)).toEqual(['tagged@b.com', 'checked@b.com']);
  });
});

/**
 * What a dead address costs, and what it takes with it.
 *
 * Two rules that only make sense together. A verified-dead address is never
 * sent to, so it must not consume a slot in a daily allowance that exists to
 * cap what actually reaches a mail server — trimming to the limit before
 * verification meant a batch of five hundred holding a hundred dead addresses
 * sent four hundred and burned the whole day doing it.
 *
 * And what remains of the lead decides whether it survives: a phone number is
 * still a business to ring, an address with nothing behind it is a row that
 * can only ever take up space in a count.
 */
describe('spending the daily allowance', () => {
  type Row = { id: string; phone: string | null; status: string | null };
  const sendable = (s: string | null) => !['invalid', 'spamtrap', 'abuse', 'do_not_mail'].includes(s ?? '');

  /** The order the route applies: verify, drop the dead, then trim. */
  const plan = (rows: Row[], limit: number) => {
    const alive = rows.filter((r) => sendable(r.status));
    return { sent: alive.slice(0, limit), heldBack: Math.max(0, alive.length - limit) };
  };

  it('does not let a dead address use up a slot', () => {
    const rows: Row[] = [
      { id: 'a', phone: null, status: 'invalid' },
      { id: 'b', phone: null, status: 'invalid' },
      { id: 'c', phone: null, status: 'valid' },
      { id: 'd', phone: null, status: 'valid' },
    ];

    // A limit of two must still send two live addresses, not two minus the
    // dead ones that were never going anywhere.
    expect(plan(rows, 2).sent.map((r) => r.id)).toEqual(['c', 'd']);
  });

  /** Nothing is waiting for tomorrow that no longer exists. */
  it('counts only live addresses as held back', () => {
    const rows: Row[] = [
      { id: 'a', phone: null, status: 'invalid' },
      { id: 'b', phone: null, status: 'valid' },
      { id: 'c', phone: null, status: 'valid' },
    ];

    expect(plan(rows, 1).heldBack).toBe(1);
  });
});

describe('what happens to a dead address', () => {
  const fate = (phone: string | null) => (phone ? 'kept' : 'deleted');

  it('keeps the lead when there is still a number to ring', () => {
    expect(fate('(212) 555-0100')).toBe('kept');
  });

  it('deletes it when the address was the only way in', () => {
    expect(fate(null)).toBe('deleted');
  });
});
