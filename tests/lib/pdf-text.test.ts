import { describe, expect, it } from 'vitest';
import { winAnsi } from '@/lib/pdf-text';

describe('winAnsi', () => {
  it('leaves the characters the standard fonts already have alone', () => {
    const fine = 'Northgate Dental Group — "Priya\'s" £6,000 · 50% · café naïve Zoë';
    expect(winAnsi(fine)).toBe(fine);
  });

  it('keeps the CP1252 punctuation the contract copy actually uses', () => {
    expect(winAnsi('“curly” ‘quotes’ – dashes — €1,000…')).toBe('“curly” ‘quotes’ – dashes — €1,000…');
  });

  it('strips an accent WinAnsi has no composed letter for rather than dropping the letter', () => {
    // Ǎ (U+01CD) is outside the repertoire; A is not.
    expect(winAnsi('Ǎdam')).toBe('Adam');
  });

  it('treats a decomposed letter as the composed one WinAnsi does have', () => {
    expect(winAnsi('Zoë')).toBe('Zoë');
  });

  it('falls back to a placeholder for scripts with no Latin-1 equivalent', () => {
    expect(winAnsi('李明')).toBe('??');
    expect(winAnsi('Priya 李 Raman')).toBe('Priya ? Raman');
  });

  it('does not carry state between calls', () => {
    // A stateful regex here would make the second answer depend on the first.
    expect(winAnsi('李')).toBe('?');
    expect(winAnsi('李')).toBe('?');
    expect(winAnsi('Zoë')).toBe('Zoë');
    expect(winAnsi('Zoë')).toBe('Zoë');
  });

  it('replaces emoji and control characters instead of throwing', () => {
    expect(winAnsi('Signed 🎉')).toBe('Signed ?');
    expect(winAnsi('a\tb')).toBe('a?b');
  });
});
