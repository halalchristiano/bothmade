import { describe, it, expect } from 'vitest';
import { sizeCompany, suggestCustomPrice, resolvePointPrices, pointsTotalCents } from '@/lib/lead-pricing';
import { parseSalesPoints } from '@/lib/leads';
import type { PlaybookEntry } from '@/lib/playbook-seed';

/**
 * A line item with no price is the one thing a rep can't talk their way past
 * mid-call, so every point has to come out of an import with a number — and
 * it has to be obvious which numbers are ours and which are agreed.
 */

const entry = (slug: string, label: string, priceCents: number): PlaybookEntry => ({
  slug,
  label,
  kind: 'essential',
  priceCents,
  whatItIs: '',
  benefit: '',
  pitch: '',
  justification: '',
  objection: null,
});

const playbook = new Map<string, PlaybookEntry>([
  ['bookingsystem', entry('bookingsystem', 'Booking system', 90000)],
  ['analyticssetup', entry('analyticssetup', 'Analytics setup', 50000)],
]);

describe('sizeCompany', () => {
  it('prefers an explicitly stated band over everything else', () => {
    const sized = sizeCompany({ companySize: 'enterprise', employeeCount: 2 });
    expect(sized.band).toBe('enterprise');
    expect(sized.known).toBe(true);
  });

  it('reads headcount when no band is given', () => {
    expect(sizeCompany({ employeeCount: 1 }).band).toBe('solo');
    expect(sizeCompany({ employeeCount: 8 }).band).toBe('small');
    expect(sizeCompany({ employeeCount: 40 }).band).toBe('medium');
    expect(sizeCompany({ employeeCount: 900 }).band).toBe('enterprise');
  });

  it('treats our own deal estimate as a guess, not a fact about them', () => {
    const sized = sizeCompany({ estimateHighCents: 2_000_000 });
    expect(sized.band).toBe('medium');
    // Prices against it, but never writes it back as their recorded size.
    expect(sized.known).toBe(false);
  });

  it('falls back to small when the sheet said nothing at all', () => {
    const sized = sizeCompany({});
    expect(sized.band).toBe('small');
    expect(sized.known).toBe(false);
  });
});

describe('suggestCustomPrice', () => {
  it('scales with the size of the business', () => {
    const solo = suggestCustomPrice('essential', sizeCompany({ employeeCount: 1 }));
    const large = suggestCustomPrice('essential', sizeCompany({ employeeCount: 100 }));
    expect(large.priceCents).toBeGreaterThan(solo.priceCents);
  });

  it('rounds to something sayable out loud', () => {
    const { priceCents } = suggestCustomPrice('upsell', sizeCompany({ employeeCount: 30 }));
    expect(priceCents % 5000).toBe(0);
  });

  it('explains itself, since somebody has to approve the number', () => {
    const { reason } = suggestCustomPrice('essential', sizeCompany({ employeeCount: 8 }));
    expect(reason).toContain('8 staff');
  });

  it('never charges for a pain point — the fix is the chargeable line', () => {
    expect(suggestCustomPrice('pain', sizeCompany({})).priceCents).toBe(0);
  });
});

describe('resolvePointPrices', () => {
  const size = sizeCompany({ employeeCount: 8 });

  it('takes the catalogue price for a point it recognises', () => {
    const [p] = resolvePointPrices(parseSalesPoints('Booking system: they lose evenings'), 'essential', playbook, size);
    expect(p.priceCents).toBe(90000);
    expect(p.isCustom).toBe(false);
  });

  it('lets a price written into the sheet win over the catalogue', () => {
    const [p] = resolvePointPrices(
      parseSalesPoints('Booking system: they lose evenings | $1,200'),
      'essential',
      playbook,
      size
    );
    expect(p.priceCents).toBe(120000);
  });

  it('suggests a price for anything not in the catalogue, and flags it', () => {
    const [p] = resolvePointPrices(
      parseSalesPoints('Drone photography: nobody local offers it'),
      'upsell',
      playbook,
      size
    );
    expect(p.priceCents).toBeGreaterThan(0);
    expect(p.isCustom).toBe(true);
    expect(p.suggestionReason).toBeTruthy();
  });

  it('still calls an item custom when the sheet priced something we do not sell', () => {
    const [p] = resolvePointPrices(
      parseSalesPoints('Drone photography: nobody offers it | $2,000'),
      'upsell',
      playbook,
      size
    );
    // The price is settled; the item still isn't in the catalogue.
    expect(p.priceCents).toBe(200000);
    expect(p.isCustom).toBe(true);
  });

  it('leaves no point without a number', () => {
    const points = resolvePointPrices(
      parseSalesPoints('Booking system: a\nSomething invented: b\nAnalytics setup: c'),
      'essential',
      playbook,
      size
    );
    expect(points.every((p) => p.priceCents !== null)).toBe(true);
    expect(pointsTotalCents(points)).toBeGreaterThan(140000);
  });
});
