import { describe, expect, it, vi } from 'vitest';

/**
 * The difference between the button that worked on a phone and the one that
 * didn't was the destination, not the markup.
 *
 * `drive.google.com` is a Google universal link: iOS hands it to the Drive
 * app rather than a browser, and when that app can't resolve the target for
 * its signed-in account the tap does nothing at all. The sign-and-pay button
 * pointed at bothmade.studio and worked; the mockups button pointed at Drive
 * and behaved like a picture of a button. Same shell, same anchor, same
 * message.
 */

import {
  driveDestination,
  emailLinkUrl,
  parseDriveTarget,
} from '@/lib/email-links';
import { parseAttachments, renderAttachments } from '@/lib/email-attachments';
import { resolveSiteUrl } from '@/lib/site-url';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

const { renderShell } = await import('@/lib/email');
const { GET } = await import('@/app/l/drive/[kind]/[id]/route');

const SITE = resolveSiteUrl();
const FOLDER = 'https://drive.google.com/drive/folders/1TP-0M9lRvXF9emiddWlUZv563L5FTNJD';

describe('parseDriveTarget', () => {
  it('recognises the share links people actually paste', () => {
    expect(parseDriveTarget(FOLDER)).toEqual({ kind: 'folder', id: '1TP-0M9lRvXF9emiddWlUZv563L5FTNJD' });
    expect(parseDriveTarget('https://drive.google.com/file/d/1A2b3C4d5E6f/view?usp=sharing')).toEqual({
      kind: 'file',
      id: '1A2b3C4d5E6f',
    });
    expect(parseDriveTarget('https://drive.google.com/drive/u/0/folders/1A2b3C4d5E6f')).toEqual({
      kind: 'folder',
      id: '1A2b3C4d5E6f',
    });
    expect(parseDriveTarget('https://drive.google.com/open?id=1A2b3C4d5E6f')).toEqual({
      kind: 'file',
      id: '1A2b3C4d5E6f',
    });
    // Pasted without the scheme, the way a link copied out of a document is.
    expect(parseDriveTarget('drive.google.com/file/d/1A2b3C4d5E6f/view')?.kind).toBe('file');
  });

  it('leaves everything that is not a Drive link alone', () => {
    expect(parseDriveTarget('https://bothmade.studio/brandon-roofing')).toBeNull();
    expect(parseDriveTarget('https://www.loom.com/share/abc')).toBeNull();
    expect(parseDriveTarget('not a link')).toBeNull();
  });

  it('does not route an image through the redirect — that is an src, not a tap', () => {
    expect(parseDriveTarget('https://drive.google.com/thumbnail?id=1A2b3C4d5E6f&sz=w1000')).toBeNull();
  });
});

describe('emailLinkUrl', () => {
  it('sends a Drive link by way of our own domain, which no app claims', () => {
    expect(emailLinkUrl(FOLDER)).toBe(`${SITE}/l/drive/folder/1TP-0M9lRvXF9emiddWlUZv563L5FTNJD`);
  });

  it('leaves a link that already works untouched', () => {
    expect(emailLinkUrl('https://bothmade.studio/brandon-roofing')).toBe('https://bothmade.studio/brandon-roofing');
  });

  it('still normalizes a link pasted without its scheme', () => {
    expect(emailLinkUrl('bothmade.studio/brandon-roofing')).toBe('https://bothmade.studio/brandon-roofing');
  });

  it('is null when there is nothing usable, so callers fail the same way as before', () => {
    expect(emailLinkUrl('ask me for it')).toBeNull();
    expect(emailLinkUrl(undefined)).toBeNull();
  });
});

describe('the redirect', () => {
  const hit = async (kind: string, id: string) =>
    GET(new Request('https://www.bothmade.studio/l/drive'), { params: Promise.resolve({ kind, id }) });

  it('sends a folder and a file to the right place', async () => {
    expect((await hit('folder', '1A2b3C4d5E6f')).headers.get('location')).toBe(
      'https://drive.google.com/drive/folders/1A2b3C4d5E6f'
    );
    expect((await hit('file', '1A2b3C4d5E6f')).headers.get('location')).toBe(
      'https://drive.google.com/file/d/1A2b3C4d5E6f/view'
    );
  });

  /**
   * The whole destination is assembled from a validated ID, so there is no
   * input that turns this into somewhere else — which is the only reason a
   * public redirect is safe to ship at all.
   */
  it('cannot be talked into pointing anywhere but Drive', async () => {
    for (const attempt of [
      ['folder', 'https://evil.example.com'],
      ['file', '../../evil'],
      ['file', 'short'],
      ['javascript:alert(1)', '1A2b3C4d5E6f'],
      ['folder', '1A2b3C4d5E6f/../../evil'],
    ] as const) {
      const location = (await hit(attempt[0], attempt[1])).headers.get('location');
      expect(location === SITE || location === `${SITE}/`).toBe(true);
    }
  });

  it('is not cached, so a link already sitting in an inbox stays correctable', async () => {
    expect((await hit('folder', '1A2b3C4d5E6f')).headers.get('cache-control')).toBe('no-store');
  });
});

describe('the email itself', () => {
  it('points the button at our domain and says so under it', () => {
    const html = renderShell({ title: 'T', bodyHtml: '<p>Hi.</p>', ctaLabel: 'View Mockups', ctaUrl: FOLDER });

    expect(html).toContain(`href="${SITE}/l/drive/folder/1TP-0M9lRvXF9emiddWlUZv563L5FTNJD"`);
    expect(html).not.toContain('href="https://drive.google.com');
    // What the fallback line reads and where it goes are the same address.
    expect(html).toContain(`>${SITE}/l/drive/folder/1TP-0M9lRvXF9emiddWlUZv563L5FTNJD</a>`);
  });

  it('routes attachment cards the same way, but leaves a picture preview direct', () => {
    const html = renderAttachments(
      parseAttachments([
        { kind: 'pdf', label: 'Both concepts', url: 'https://drive.google.com/file/d/1A2b3C4d5E6f/view' },
        { kind: 'image', label: 'Concept 1', url: 'https://drive.google.com/file/d/9Z8y7X6w5V4u/view' },
      ])
    );

    expect(html).toContain(`href="${SITE}/l/drive/file/1A2b3C4d5E6f"`);
    // The thumbnail is fetched, not tapped, so it goes straight to Google.
    expect(html).toContain('src="https://drive.google.com/thumbnail?id=9Z8y7X6w5V4u');
    expect(html).not.toContain('href="https://drive.google.com');
  });

  it('leaves a link that was never the problem exactly as it was', () => {
    const html = renderShell({
      title: 'T',
      bodyHtml: '<p>Hi.</p>',
      ctaLabel: 'Review & Pay',
      ctaUrl: 'https://www.bothmade.studio/sign/abc?t=xyz',
    });

    expect(html).toContain('href="https://www.bothmade.studio/sign/abc?t=xyz"');
    expect(html).not.toContain('/l/drive/');
  });
});
