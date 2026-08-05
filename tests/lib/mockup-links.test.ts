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
