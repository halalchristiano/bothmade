import { describe, expect, it } from 'vitest';
import {
  DELIVERABLE_CONTENT_TYPES,
  DELIVERABLE_MAX_BYTES,
  DOCUMENT_CONTENT_TYPES,
  VIDEO_CONTENT_TYPES,
  checkUpload,
  contentTypeForFile,
  formatFileSize,
} from '@/lib/uploads';

/**
 * The upload policy exists to keep executable files and unbounded uploads
 * off our storage, and it has to do that without refusing the things the
 * feature is for. A mockup is sometimes a video, and a video is whatever the
 * recorder produced — so what's asserted here is that a real recording gets
 * through, that an oversized one is refused before the upload rather than
 * after it, and that text/html still never gets a token.
 */

const policy = { allowed: DELIVERABLE_CONTENT_TYPES, maxBytes: DELIVERABLE_MAX_BYTES };

function file(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return { name: 'walkthrough.mp4', type: 'video/mp4', size: 5 * 1024 * 1024, ...overrides };
}

describe('what a mockup is allowed to be', () => {
  it.each([
    ['a Mac screen recording', 'video/quicktime'],
    ['a Loom or OBS export', 'video/webm'],
    ['an Android capture', 'video/3gpp'],
    ['an older screen grab', 'video/x-msvideo'],
    ['an mkv', 'video/x-matroska'],
  ])('accepts %s', (_label, type) => {
    expect(DELIVERABLE_CONTENT_TYPES).toContain(type);
  });

  it('still refuses the two types that execute when opened', () => {
    expect(DELIVERABLE_CONTENT_TYPES).not.toContain('text/html');
    expect(VIDEO_CONTENT_TYPES).not.toContain('image/svg+xml');
  });

  it('leaves the paperwork fields as PDF-only — a field labelled "invoice" is not a video', () => {
    expect(DOCUMENT_CONTENT_TYPES).toEqual(['application/pdf']);
  });

  it('fits a real walkthrough recording under the cap', () => {
    expect(DELIVERABLE_MAX_BYTES).toBeGreaterThan(300 * 1024 * 1024);
  });
});

describe('working out what a file is', () => {
  it('takes the browser at its word when it says anything', () => {
    expect(contentTypeForFile('clip.bin', 'video/mp4')).toBe('video/mp4');
  });

  it('reads the extension when the browser leaves the type blank — an iOS video share', () => {
    expect(contentTypeForFile('IMG_4021.MOV', '')).toBe('video/quicktime');
  });

  it('reads the extension past a generic octet-stream too', () => {
    expect(contentTypeForFile('demo.webm', 'application/octet-stream')).toBe('video/webm');
  });

  it('gives up on a file with neither a type nor an extension', () => {
    expect(contentTypeForFile('recording', '')).toBeNull();
  });

  it('gives up on an extension it has no mapping for', () => {
    expect(contentTypeForFile('notes.sketch', '')).toBeNull();
  });
});

describe('checking a file before any of it is uploaded', () => {
  it('passes a video through with the type it should be stored as', () => {
    expect(checkUpload(file({ name: 'walkthrough.MOV', type: '' }), policy)).toEqual({
      contentType: 'video/quicktime',
    });
  });

  it('names the size and the limit rather than failing at the end of the upload', () => {
    const result = checkUpload(file({ size: 700 * 1024 * 1024 }), policy);

    expect(result).toEqual({ error: expect.stringContaining('700 MB') });
    expect(result).toEqual({ error: expect.stringContaining('512 MB') });
  });

  it('refuses a type off the list', () => {
    expect(checkUpload(file({ name: 'page.html', type: 'text/html' }), policy)).toEqual({
      error: expect.stringContaining('text/html'),
    });
  });

  it('says what to do about a file it cannot identify', () => {
    expect(checkUpload(file({ name: 'recording', type: '' }), policy)).toEqual({
      error: expect.stringContaining('extension'),
    });
  });
});

describe('formatFileSize', () => {
  it.each([
    [512, '512 bytes'],
    [200 * 1024, '200 KB'],
    [3.5 * 1024 * 1024, '3.5 MB'],
    [312 * 1024 * 1024, '312 MB'],
  ])('renders %i as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});
