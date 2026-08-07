import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The headshot column, and the upload policy it was quietly ignoring.
 *
 * `avatar-upload` is careful on purpose: it mints a Blob token for a short
 * list of image types under a size cap, so nobody can park an HTML or SVG
 * file on our own storage domain and send a convincing link to it. Then this
 * route stored whatever string arrived — so none of that had to be gone
 * through. A browser could skip the upload entirely and PATCH a URL.
 *
 * What that buys is small and aimed inward, which is why it is easy to miss:
 * an avatar renders as an <img> on pages the rest of the studio opens, so an
 * off-site URL turns every teammate's page view into a request to somebody
 * else's server carrying their address and the hour they were working.
 */

const update = vi.fn(async (_a: unknown) => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: async () => null, update: (a: unknown) => update(a) } },
}));
vi.mock('@/lib/middleware', () => ({
  requireStaff: async () => ({ type: 'user', userId: 'user_kiana', email: 'k@bothmade.studio', role: 'owner' }),
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));

const { PATCH } = await import('@/app/api/admin/settings/profile/route');

const patch = async (body: unknown) => {
  const res = await PATCH(
    new Request('https://bothmade.studio/api/admin/settings/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );
  return { status: res.status, body: await res.json() };
};

/** What was written to the row on the last accepted call. */
const written = () => (update.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data;

beforeEach(() => update.mockClear());

describe('a headshot the studio uploaded', () => {
  it('is stored', async () => {
    const url = 'https://abc123.public.blob.vercel-storage.com/avatar-x9.png';
    const { status } = await patch({ avatarUrl: url });

    expect(status).toBe(200);
    expect(written().avatarUrl).toBe(url);
  });

  it('can be cleared with null', async () => {
    const { status } = await patch({ avatarUrl: null });

    expect(status).toBe(200);
    expect(written().avatarUrl).toBeNull();
  });

  it('can be cleared with an empty string, which is what removing one sends', async () => {
    const { status } = await patch({ avatarUrl: '' });

    expect(status).toBe(200);
    expect(written().avatarUrl).toBeNull();
  });
});

describe('a headshot pointing somewhere else', () => {
  it('refuses a URL on a server that is not ours', async () => {
    const { status } = await patch({ avatarUrl: 'https://tracker.example.com/pixel.gif' });

    expect(status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a script URL', async () => {
    const { status } = await patch({ avatarUrl: 'javascript:alert(1)' });

    expect(status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses plain http, even on the right host', async () => {
    const { status } = await patch({ avatarUrl: 'http://abc.public.blob.vercel-storage.com/a.png' });

    expect(status).toBe(400);
  });

  it('is not fooled by a lookalike hostname', async () => {
    const { status } = await patch({
      avatarUrl: 'https://vercel-storage.com.evil.example/a.png',
    });

    expect(status).toBe(400);
  });
});

describe('the text fields beside it', () => {
  it('caps a name rather than storing whatever arrives', async () => {
    const { status } = await patch({ name: 'K'.repeat(5000) });

    expect(status).toBe(200);
    expect(String(written().name)).toHaveLength(120);
  });

  it('still refuses an empty name', async () => {
    const { status, body } = await patch({ name: '   ' });

    expect(status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it('treats a blank title as no title', async () => {
    const { status } = await patch({ title: '  ' });

    expect(status).toBe(200);
    expect(written().title).toBeNull();
  });
});
