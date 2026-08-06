import { describe, expect, it, vi } from 'vitest';

/**
 * A lead has two mockup links and they are not interchangeable.
 *
 * The folder is the deliverable — screenshots, brochure, walkthrough video —
 * and it is what an email carries. The preview build is a Vercel deployment
 * behind a password, so a prospect's competitors can't find their
 * unannounced redesign; sending it hands the client a password wall.
 *
 * They used to be one column. The lead page offered whatever was in it under
 * a button reading "open the mockup we sent" — on leads nothing had been sent
 * to — and the composer pre-filled the same value as the link to send. This
 * is the guard that keeps them apart.
 */

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

const { clientMockupLink, normalizeMockupUrl } = await import('@/lib/mockups');

describe('clientMockupLink', () => {
  it('is the folder, which is the only thing that may be emailed', () => {
    expect(
      clientMockupLink({
        mockupFolderUrl: 'https://drive.google.com/drive/folders/1A2b3C4d5E6f',
        mockupUrl: 'https://monogram.bothmade.studio',
      })
    ).toBe('https://drive.google.com/drive/folders/1A2b3C4d5E6f');
  });

  /**
   * The important one. A lead with only a preview build has nothing to send,
   * and answering with the preview would be the original bug — a client
   * clicking through to a password prompt.
   */
  it('is null when all the lead has is a preview build', () => {
    expect(clientMockupLink({ mockupFolderUrl: null, mockupUrl: 'https://monogram.bothmade.studio' })).toBeNull();
    expect(clientMockupLink({ mockupUrl: 'https://monogram.bothmade.studio' })).toBeNull();
  });

  it('is null on a lead with neither, so the send button never appears', () => {
    expect(clientMockupLink({ mockupFolderUrl: null, mockupUrl: null })).toBeNull();
    expect(clientMockupLink({})).toBeNull();
  });

  it('fixes up a folder link pasted without its scheme, rather than sending a dead one', () => {
    expect(clientMockupLink({ mockupFolderUrl: 'drive.google.com/drive/folders/1A2b3C4d5E6f' })).toBe(
      'https://drive.google.com/drive/folders/1A2b3C4d5E6f'
    );
  });

  it('refuses prose typed into the folder box', () => {
    expect(clientMockupLink({ mockupFolderUrl: 'ask kiana for it' })).toBeNull();
    expect(clientMockupLink({ mockupFolderUrl: '   ' })).toBeNull();
  });

  /**
   * The stricter mockup normalizer drops a scheme-less host, which is fine
   * for a preview subdomain somebody types and wrong for a Drive folder
   * copied out of a document. The folder goes through the same path an
   * emailed link does.
   */
  it('is more forgiving than the preview field, because it is an emailed link', () => {
    expect(normalizeMockupUrl('drive.google.com/drive/folders/1A2b3C4d5E6f')).toBeNull();
    expect(clientMockupLink({ mockupFolderUrl: 'drive.google.com/drive/folders/1A2b3C4d5E6f' })).toBe(
      'https://drive.google.com/drive/folders/1A2b3C4d5E6f'
    );
  });
});

/**
 * Found by running a send against a real database, not by reading the code.
 *
 * recordLeadMockup caches whatever it is handed into the lead's `mockupUrl`,
 * which is right for an attach — that column is a cache of the latest
 * attached version. It is wrong for the folder send: the folder has a column
 * of its own, and caching it there overwrote the preview build with the
 * folder link, putting both links back in one field. Which is the entire
 * thing the second column exists to prevent.
 */
describe('recordLeadMockup', () => {
  const leadUpdate =
    vi.fn<(args: { where: unknown; data: Record<string, unknown> }) => Promise<unknown>>();

  const load = async () => {
    vi.resetModules();
    leadUpdate.mockReset();
    leadUpdate.mockResolvedValue({ id: 'l1', company: 'Monogram' });
    vi.doMock('@/lib/prisma', () => ({
      prisma: {
        leadMockup: {
          findMany: vi.fn(async () => []),
          create: vi.fn(async () => ({
            id: 'm1',
            url: 'https://drive.google.com/drive/folders/1A2b3C4d5E6f',
            fileName: null,
            note: '',
            status: 'draft',
            shareToken: 't',
            viewCount: 0,
            createdAt: new Date(),
            sentAt: null,
            firstViewedAt: null,
            lastViewedAt: null,
            expiresAt: null,
            respondedAt: null,
            responseNote: null,
            uploadedBy: null,
          })),
        },
        lead: { update: leadUpdate },
        teamMessage: { updateMany: vi.fn(async () => ({})), create: vi.fn(async () => ({})) },
      },
    }));
    return (await import('@/lib/mockups')).recordLeadMockup;
  };

  const args = {
    leadId: 'l1',
    url: 'https://drive.google.com/drive/folders/1A2b3C4d5E6f',
    userId: 'u1',
  };

  it('leaves the preview build alone when the URL already has a column', async () => {
    const record = await load();
    await record({ ...args, cacheAsLatest: false });

    const data = leadUpdate.mock.calls[0]?.[0]?.data ?? {};
    expect(data).not.toHaveProperty('mockupUrl');
    // The delivery stamp still moves — something was delivered.
    expect(data).toHaveProperty('mockupDeliveredAt');
  });

  it('still caches by default, so attaching a version is unchanged', async () => {
    const record = await load();
    await record(args);

    expect(leadUpdate.mock.calls[0]?.[0]?.data?.mockupUrl).toBe(args.url);
  });
});
