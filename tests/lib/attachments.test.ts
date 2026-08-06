import { describe, expect, it } from 'vitest';
import {
  describeAttachment,
  hostOf,
  normalizeAttachmentUrl,
  readAttachments,
  suggestAttachmentName,
} from '@/lib/attachments';

describe('describeAttachment', () => {
  it('names a Google Doc as one, which its URL never says', () => {
    const meta = describeAttachment({
      name: 'Brand notes',
      url: 'https://docs.google.com/document/d/1AbC/edit',
    });
    expect(meta.kind).toBe('doc');
    expect(meta.typeLabel).toBe('Google Doc');
    expect(meta.host).toBe('docs.google.com');
  });

  it('tells a Drive folder from a Drive file', () => {
    expect(
      describeAttachment({ name: 'Assets', url: 'https://drive.google.com/drive/folders/abc' }).kind
    ).toBe('folder');
    expect(
      describeAttachment({ name: 'Logo', url: 'https://drive.google.com/file/d/abc/view' }).kind
    ).toBe('doc');
  });

  it('reads the extension when the host gives nothing away', () => {
    expect(describeAttachment({ name: 'x', url: 'https://acme.com/contract.pdf' }).typeLabel).toBe(
      'PDF'
    );
    expect(describeAttachment({ name: 'x', url: 'https://acme.com/scope.docx' }).typeLabel).toBe(
      'Document'
    );
    expect(describeAttachment({ name: 'x', url: 'https://acme.com/costs.xlsx?dl=1' }).typeLabel).toBe(
      'Spreadsheet'
    );
  });

  // A Blob URL carries a random suffix, so an old upload is only recognisable
  // by the name it was stored under.
  it('falls back to the stored name when the URL is opaque', () => {
    expect(
      describeAttachment({ name: 'Contract.pdf', url: 'https://blob.example.com/xY7q9' }).typeLabel
    ).toBe('PDF');
  });

  it('says "Link" rather than guessing when nothing identifies it', () => {
    expect(describeAttachment({ name: 'Their site', url: 'https://acme.com/about' }).kind).toBe(
      'link'
    );
  });
});

describe('normalizeAttachmentUrl', () => {
  it('puts the scheme back on a pasted address', () => {
    expect(normalizeAttachmentUrl('figma.com/file/abc')).toBe('https://figma.com/file/abc');
  });

  // These become an href somebody clicks. Nothing that executes may survive.
  it('refuses anything that is not http(s)', () => {
    expect(normalizeAttachmentUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeAttachmentUrl('data:text/html,<script>')).toBeNull();
    expect(normalizeAttachmentUrl('ftp://example.com/x')).toBeNull();
    expect(normalizeAttachmentUrl('   ')).toBeNull();
    expect(normalizeAttachmentUrl(null)).toBeNull();
  });

  it('leaves a well-formed link alone', () => {
    expect(normalizeAttachmentUrl('https://acme.com/a?b=c')).toBe('https://acme.com/a?b=c');
  });
});

describe('suggestAttachmentName', () => {
  it('reads a filename out of a path', () => {
    expect(suggestAttachmentName('https://acme.com/files/Q3-brand-guidelines.pdf')).toBe(
      'Q3 brand guidelines.pdf'
    );
  });

  it('skips the ids and the /edit that Google URLs are mostly made of', () => {
    // Nothing meaningful is left, so the host is the honest answer.
    expect(suggestAttachmentName('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrS/edit')).toBe(
      'docs.google.com'
    );
  });
});

describe('readAttachments', () => {
  it('reads the legacy JSON-in-a-string column', () => {
    expect(readAttachments('[{"name":"Brief","url":"https://acme.com/brief.pdf"}]')).toEqual([
      { name: 'Brief', url: 'https://acme.com/brief.pdf' },
    ]);
  });

  it('reads the native JSON column', () => {
    expect(readAttachments([{ name: 'Brief', url: 'https://acme.com/brief.pdf' }])).toEqual([
      { name: 'Brief', url: 'https://acme.com/brief.pdf' },
    ]);
  });

  // Project messages default to "" and team messages to [], and both arrive
  // at the same renderer.
  it('treats every empty shape as no attachments', () => {
    expect(readAttachments('')).toEqual([]);
    expect(readAttachments('[]')).toEqual([]);
    expect(readAttachments(null)).toEqual([]);
    expect(readAttachments('not json')).toEqual([]);
    expect(readAttachments({ name: 'x', url: 'y' })).toEqual([]);
  });

  it('drops a link that would execute', () => {
    expect(readAttachments([{ name: 'evil', url: 'javascript:alert(1)' }])).toEqual([]);
  });

  it('caps how many one message can carry', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `f${i}`,
      url: `https://acme.com/${i}`,
    }));
    expect(readAttachments(many)).toHaveLength(10);
  });
});

describe('hostOf', () => {
  it('drops the www nobody reads', () => {
    expect(hostOf('https://www.acme.com/x')).toBe('acme.com');
  });

  it('returns nothing for a string that is not a URL', () => {
    expect(hostOf('nonsense')).toBe('');
  });
});
