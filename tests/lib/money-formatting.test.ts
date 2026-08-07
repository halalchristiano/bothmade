import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { formatCents, formatCentsExact } from '@/lib/pricing';

/**
 * A price is written in our notation, not the reader's.
 *
 * Six client-facing surfaces rolled their own formatter as
 * `` `$${(cents / 100).toLocaleString()}` `` — a bare toLocaleString, which
 * formats in the BROWSER's locale. The dollar sign was ours and the digit
 * grouping was theirs. A client in Berlin read "$12.500" on the page where
 * they sign, and in their notation that is twelve dollars fifty. Paris gets a
 * narrow space; India regroups six figures into lakhs.
 *
 * The rolled-own version was also wrong in en-US, which is what makes this
 * more than a hypothetical: the default has no fraction-digit floor, so a
 * payment of $1,650.50 rendered "$1,650.5" — a money figure with one decimal
 * place, on a receipt.
 *
 * lib/pricing has always exported the pinned pair. These tests hold the
 * formatters, and then hold the absence of the pattern, because the failure
 * mode is not a broken formatter — it is the next page that writes its own.
 */

describe('the formatters', () => {
  it('groups in en-US regardless of the machine running it', () => {
    // Under LANG=de_DE this is where a bare toLocaleString gives "12.500".
    expect(formatCents(1_250_000)).toBe('$12,500');
    expect(formatCentsExact(1_250_000)).toBe('$12,500');
  });

  it('never renders a half-cent figure with one decimal place', () => {
    expect(formatCentsExact(165_050)).toBe('$1,650.50');
  });

  it('drops the cents only when there are none', () => {
    expect(formatCentsExact(200_000)).toBe('$2,000');
    expect(formatCentsExact(200_001)).toBe('$2,000.01');
  });

  it('handles the lakh boundary the same way everywhere', () => {
    // 12,50,000 under en-IN; 1,250,000 here, always.
    expect(formatCents(125_000_000)).toBe('$1,250,000');
  });
});

/**
 * The pattern itself, banned by grep.
 *
 * Every one of these was written independently by somebody who needed a price
 * on a page and did the obvious thing. A unit test on lib/pricing cannot catch
 * the seventh; this can.
 */
describe('nobody writes their own', () => {
  const SURFACES = [
    'app/sign/[leadId]/page.tsx',
    'app/care/[token]/page.tsx',
    'app/client/[projectId]/page.tsx',
    'app/admin/projects/page.tsx',
    'app/admin/priorities/page.tsx',
    'lib/email.ts',
  ];

  it.each(SURFACES)('%s formats money through lib/pricing', async (path) => {
    const source = await readFile(path, 'utf8');

    // The exact shape that was wrong: cents divided down, then formatted with
    // no locale argument at all.
    expect(source).not.toMatch(/\/\s*100\)\.toLocaleString\(\)/);
  });
});
