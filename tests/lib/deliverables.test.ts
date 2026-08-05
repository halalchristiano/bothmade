import { describe, expect, it } from 'vitest';
import { deliverableHref, isOpenable, readDeliverable } from '@/lib/deliverables';

/**
 * These exist because a deliverable called "Kiana Arabpour" reached a live
 * dashboard and opened nothing. The client's side has no Delete, so a dead
 * entry sits in their files looking like something we sent them and broke.
 */

describe('what can actually be opened', () => {
  it('takes a normal link', () => {
    expect(deliverableHref('https://blob.example.com/brand.pdf')).toBe(
      'https://blob.example.com/brand.pdf'
    );
  });

  /** People paste hosts without the scheme constantly, and a browser would
   *  treat that as a path inside our own app. Worth rescuing. */
  it('rescues a host pasted without its scheme', () => {
    expect(deliverableHref('example.com/file.pdf')).toBe('https://example.com/file.pdf');
  });

  /** The actual bug: a person's name in the URL box. */
  it('refuses a name typed into the URL box', () => {
    expect(deliverableHref('Kiana Arabpour')).toBeNull();
  });

  it('refuses empty, blank and non-strings', () => {
    expect(deliverableHref('')).toBeNull();
    expect(deliverableHref('   ')).toBeNull();
    expect(deliverableHref(null)).toBeNull();
    expect(deliverableHref(undefined)).toBeNull();
    expect(deliverableHref(42)).toBeNull();
  });

  /**
   * Refused rather than merely unrecognised: this string is typed by a person
   * and rendered as an anchor on a dashboard a client is logged into.
   */
  it('refuses schemes a link should never carry', () => {
    expect(deliverableHref('javascript:alert(1)')).toBeNull();
    expect(deliverableHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(deliverableHref('file:///etc/passwd')).toBeNull();
  });

  it('answers the same question for a stored row', () => {
    expect(isOpenable({ url: 'https://example.com/a.pdf' })).toBe(true);
    expect(isOpenable({ url: 'Kiana Arabpour' })).toBe(false);
    expect(isOpenable({})).toBe(false);
  });
});

describe('adding one', () => {
  it('accepts a name and a real link', () => {
    const result = readDeliverable({ name: '  Brand guide  ', url: 'https://x.test/b.pdf' });

    expect(result).toEqual({ ok: true, name: 'Brand guide', url: 'https://x.test/b.pdf' });
  });

  it('demands a name', () => {
    expect(readDeliverable({ name: '   ', url: 'https://x.test/b.pdf' }).ok).toBe(false);
  });

  /** Quotes back what was typed, so the mistake is obvious. */
  it('says what is wrong with the link, in their words', () => {
    const result = readDeliverable({ name: 'Brand guide', url: 'Kiana Arabpour' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Kiana Arabpour/);
      expect(result.error).toMatch(/https:\/\//);
    }
  });

  it('asks for a link when there is none at all', () => {
    const result = readDeliverable({ name: 'Brand guide', url: '' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Add the link/);
  });
});
