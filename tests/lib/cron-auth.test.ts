import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireCronAuth } from '@/lib/cron-auth';

/**
 * The /api/cron/* routes send mail to every lead's assigned rep and scan
 * connected Gmail mailboxes. `proxy.ts` lists /api/cron/ as a public prefix,
 * deliberately — Vercel Cron arrives with no session cookie — so this guard
 * is the *entire* perimeter for those endpoints. There is nothing behind it.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function get(headers: Record<string, string> = {}): Request {
  return new Request('https://bothmade.studio/api/cron/stale-leads', { headers });
}

describe('when CRON_SECRET is not set', () => {
  it('refuses to run rather than running for anyone', async () => {
    // The original bug was `if (process.env.CRON_SECRET && ...)`, which made
    // an unset secret mean "no check" — the endpoints were public exactly when
    // they were least configured. A secret we do not have is a caller we
    // cannot identify, so the only safe answer is no.
    vi.stubEnv('CRON_SECRET', '');
    const response = requireCronAuth(get({ authorization: 'Bearer anything' }));
    expect(response?.status).toBe(503);
  });

  it('refuses a request with no authorization header at all', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(requireCronAuth(get())?.status).toBe(503);
  });
});

describe('when CRON_SECRET is set', () => {
  const SECRET = 'a-real-cron-secret-value';

  it('lets the correct bearer token through', () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(requireCronAuth(get({ authorization: `Bearer ${SECRET}` }))).toBeNull();
  });

  it('rejects a missing header', () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(requireCronAuth(get())?.status).toBe(401);
  });

  it('rejects the right secret sent without the Bearer scheme', () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(requireCronAuth(get({ authorization: SECRET }))?.status).toBe(401);
  });

  it('rejects a wrong secret of exactly the right length', () => {
    // The length check runs before timingSafeEqual, which throws on a
    // mismatch. A same-length wrong value is the case that actually exercises
    // the comparison rather than the guard in front of it.
    vi.stubEnv('CRON_SECRET', SECRET);
    const wrong = 'b'.repeat(SECRET.length);
    expect(wrong).toHaveLength(SECRET.length);
    expect(requireCronAuth(get({ authorization: `Bearer ${wrong}` }))?.status).toBe(401);
  });

  it('rejects a value that is a correct prefix of the secret', () => {
    // The shape a byte-at-a-time guess takes: right so far, then truncated.
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(
      requireCronAuth(get({ authorization: `Bearer ${SECRET.slice(0, -1)}` }))?.status
    ).toBe(401);
  });

  it('rejects the secret with anything appended', () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(requireCronAuth(get({ authorization: `Bearer ${SECRET}x` }))?.status).toBe(401);
  });

  it('does not throw on a differing length — it returns a 401', () => {
    // crypto.timingSafeEqual throws a RangeError on buffers of unequal
    // length. Unguarded, a one-character header would 500 out of a route
    // rather than 401, which is both a worse answer and a signal in itself.
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(() => requireCronAuth(get({ authorization: 'B' }))).not.toThrow();
    expect(requireCronAuth(get({ authorization: 'B' }))?.status).toBe(401);
  });

  it('is not fooled by an empty bearer token', () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(requireCronAuth(get({ authorization: 'Bearer ' }))?.status).toBe(401);
  });
});
