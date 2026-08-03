import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every secret this app signs or encrypts with once had a hardcoded fallback
 * — 'your-secret-key', 'your-session-secret', 'bothmade-dev-secret'. A deploy
 * that forgot the variable didn't break; it silently ran on a value published
 * in this repository, which means anyone could mint a valid owner JWT.
 *
 * There is no safe default for a secret, so there is no default. These tests
 * are what keeps one from creeping back in.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

/** Fresh module each time — the loader caches resolved secrets by design. */
async function env() {
  return import('@/lib/env');
}

const STRONG = 'x'.repeat(48);

describe('a missing secret', () => {
  it('throws rather than falling back to anything', async () => {
    delete process.env.JWT_SECRET;
    const { jwtSecret } = await env();

    expect(() => jwtSecret()).toThrow(/JWT_SECRET is not set/);
  });

  it('says how to generate one, so nobody has to guess', async () => {
    delete process.env.JWT_SECRET;
    const { jwtSecret } = await env();

    expect(() => jwtSecret()).toThrow(/openssl rand/);
  });

  it('treats an empty or whitespace-only value as missing', async () => {
    process.env.JWT_SECRET = '   ';
    const { jwtSecret } = await env();

    expect(() => jwtSecret()).toThrow(/not set/);
  });
});

describe('the fallbacks that used to ship', () => {
  // These exact strings are in this repository's history. Anyone who copies
  // one out of an old README has a secret that protects nothing.
  const PUBLISHED = ['your-secret-key', 'your-session-secret', 'bothmade-dev-secret'];

  for (const value of PUBLISHED) {
    it(`rejects "${value}" by name`, async () => {
      process.env.JWT_SECRET = value;
      const { jwtSecret } = await env();

      expect(() => jwtSecret()).toThrow(/public|placeholder/i);
    });
  }

  it('rejects the usual placeholders too', async () => {
    for (const value of ['changeme', 'secret', 'password', 'test']) {
      vi.resetModules();
      process.env.JWT_SECRET = value;
      const { jwtSecret } = await env();
      expect(() => jwtSecret(), value).toThrow();
    }
  });

  it('is case-insensitive, so CHANGEME is no better', async () => {
    process.env.JWT_SECRET = 'ChangeMe';
    const { jwtSecret } = await env();

    expect(() => jwtSecret()).toThrow();
  });
});

describe('a real secret', () => {
  it('is accepted and returned', async () => {
    process.env.JWT_SECRET = STRONG;
    const { jwtSecret } = await env();

    expect(jwtSecret()).toBe(STRONG);
  });

  it('warns but still works when it is shorter than recommended', async () => {
    process.env.JWT_SECRET = 'short-but-not-a-placeholder';
    const { jwtSecret } = await env();

    expect(jwtSecret()).toBe('short-but-not-a-placeholder');
    expect(console.warn).toHaveBeenCalled();
  });

  it('keeps JWT and session secrets separate', async () => {
    process.env.JWT_SECRET = STRONG;
    process.env.SESSION_SECRET = 'y'.repeat(48);
    const { jwtSecret, sessionSecret } = await env();

    expect(jwtSecret()).not.toBe(sessionSecret());
  });
});

describe('assertBootSecrets', () => {
  it('refuses to boot when a signing secret is missing', async () => {
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    const { assertBootSecrets } = await env();

    // A server that boots with no JWT_SECRET is worse than one that doesn't
    // boot: it looks healthy while signing sessions with a published value.
    expect(() => assertBootSecrets()).toThrow(/JWT_SECRET|SESSION_SECRET/);
  });

  it('names every missing secret at once, not one per restart', async () => {
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    const { assertBootSecrets } = await env();

    let message = '';
    try {
      assertBootSecrets();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('SESSION_SECRET');
  });

  it('passes once both are set properly', async () => {
    process.env.JWT_SECRET = STRONG;
    process.env.SESSION_SECRET = 'y'.repeat(48);
    const { assertBootSecrets } = await env();

    expect(() => assertBootSecrets()).not.toThrow();
  });
});
