import { describe, expect, it } from 'vitest';
import { sanitizeAttachments, unreadWhere } from '@/lib/team-chat';

/**
 * The unread predicate was the most-commented, least-tested code in the
 * chat: three clauses hand-copied across three routes, each carrying the
 * same explanatory comment about broadcasts. Now it's one function, these
 * are its tests, and the attachment sanitizer gets the hostile-input
 * treatment anything client-supplied deserves.
 */

describe('unreadWhere', () => {
  it('counts broadcasts and my DMs, never my own messages', () => {
    const where = unreadWhere('me', null);

    expect(where.fromUserId).toEqual({ not: 'me' });
    expect(where.OR).toEqual([{ toUserId: 'me' }, { toUserId: null }]);
    expect(where.createdAt).toBeUndefined();
  });

  it('windows on the read timestamp once one exists', () => {
    const readAt = new Date('2026-08-01T00:00:00Z');
    const where = unreadWhere('me', readAt);

    expect(where.createdAt).toEqual({ gt: readAt });
  });
});

describe('sanitizeAttachments', () => {
  it('keeps well-formed http(s) files and drops everything else', () => {
    const result = sanitizeAttachments([
      { name: 'brief.pdf', url: 'https://blob.example.com/brief.pdf' },
      { name: 'evil', url: 'javascript:alert(1)' },
      { name: 'ftp', url: 'ftp://example.com/x' },
      { name: '', url: 'https://blob.example.com/unnamed.pdf' },
      'not-an-object',
      { name: 'no-url' },
    ]);

    expect(result).toEqual([{ name: 'brief.pdf', url: 'https://blob.example.com/brief.pdf' }]);
  });

  it('caps volume and name length rather than storing whatever arrives', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: 'x'.repeat(500),
      url: `https://blob.example.com/${i}`,
    }));
    const result = sanitizeAttachments(many);

    expect(result).toHaveLength(10);
    expect(result[0].name).toHaveLength(200);
  });

  it('returns [] for non-arrays instead of throwing on hostile payloads', () => {
    expect(sanitizeAttachments(null)).toEqual([]);
    expect(sanitizeAttachments('[]')).toEqual([]);
    expect(sanitizeAttachments({ 0: {} })).toEqual([]);
  });
});
