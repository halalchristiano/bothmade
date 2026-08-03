import { describe, expect, it } from 'vitest';
import {
  unsubscribeToken,
  verifyUnsubscribeToken,
  withComplianceFooter,
} from '@/lib/compliance';

describe('unsubscribe tokens', () => {
  it('round-trips and normalises case', () => {
    expect(verifyUnsubscribeToken(unsubscribeToken('Someone@Example.COM')))
      .toBe('someone@example.com');
  });
  it('rejects a tampered MAC', () => {
    const t = unsubscribeToken('a@b.co');
    const flipped = t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a');
    expect(verifyUnsubscribeToken(flipped)).toBeNull();
  });
  it('rejects a token re-pointed at a different address', () => {
    const mac = unsubscribeToken('a@b.co').split('.')[1];
    const forged = Buffer.from('victim@b.co').toString('base64url') + '.' + mac;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });
  it('rejects garbage', () => {
    expect(verifyUnsubscribeToken('nonsense')).toBeNull();
    expect(verifyUnsubscribeToken('a.b')).toBeNull();
    expect(verifyUnsubscribeToken('')).toBeNull();
  });
});

describe('withComplianceFooter', () => {
  it('lands inside <body>, not after </html>', () => {
    const html = '<html><body><p>hi</p></body></html>';
    const out = withComplianceFooter(html, 'a@b.co');
    expect(out.indexOf('Unsubscribe')).toBeLessThan(out.indexOf('</body>'));
  });
  it('appends when there is no body tag', () => {
    expect(withComplianceFooter('<p>hi</p>', 'a@b.co')).toContain('Unsubscribe');
  });
});
