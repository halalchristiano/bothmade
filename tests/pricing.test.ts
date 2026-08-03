import { describe, expect, it } from 'vitest';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
  calculatePrice,
  depositAmount,
  feeAdjustmentLines,
  formatCents,
  minAllowedPrice,
  expandAddOnDependencies,
  isIncludedInBase,
} from '@/lib/pricing';

describe('calculatePrice', () => {
  it('is base + add-ons, times both multipliers, rounded', () => {
    const b = calculatePrice({
      baseService: 'website',
      addOns: ['seo'],
      clientType: 'enterprise',
      timeline: 'rush',
    });
    expect(b.subtotal).toBe(BASE_SERVICES.website.price + ADD_ONS.seo.price);
    expect(b.totalPrice).toBe(
      Math.round(b.subtotal * CLIENT_TYPES.enterprise.multiplier * TIMELINES.rush.multiplier)
    );
  });

  it('never charges for add-ons bundled into the base service', () => {
    // Web App bundles its backend/auth; selecting them must not add cost.
    const bundled = Object.keys(ADD_ONS).filter((k) =>
      isIncludedInBase('web-app', k as keyof typeof ADD_ONS)
    ) as (keyof typeof ADD_ONS)[];
    const withBundled = calculatePrice({
      baseService: 'web-app', addOns: bundled, clientType: 'smb', timeline: 'standard',
    });
    const without = calculatePrice({
      baseService: 'web-app', addOns: [], clientType: 'smb', timeline: 'standard',
    });
    expect(withBundled.totalPrice).toBe(without.totalPrice);
  });

  it('dependency expansion pulls in what a feature needs to function', () => {
    const expanded = expandAddOnDependencies(['ecommerce']);
    expect(expanded).toContain('ecommerce');
    expect(expanded.length).toBeGreaterThan(1); // e-commerce needs a backend
  });
});

describe('money helpers', () => {
  it('deposit is half, and floor bounds a discount', () => {
    expect(depositAmount(100000)).toBe(50000);
    expect(minAllowedPrice(100000)).toBeLessThan(100000);
    expect(minAllowedPrice(100000)).toBeGreaterThan(0);
  });

  it('formatCents renders whole dollars', () => {
    expect(formatCents(300000)).toMatch(/3,000/);
  });
});

describe('feeAdjustmentLines — the contract must add up', () => {
  const breakdown = calculatePrice({
    baseService: 'website', addOns: ['seo'], clientType: 'enterprise', timeline: 'rush',
  });

  it('names both multipliers when they are not 1.00', () => {
    const lines = feeAdjustmentLines({
      breakdown,
      clientTypeLabel: 'Enterprise',
      timelineLabel: 'Rush',
      finalTotal: breakdown.totalPrice,
    });
    expect(lines.some((l) => l.label.includes(`×${breakdown.clientTypeMultiplier}`))).toBe(true);
    expect(lines.some((l) => l.label.includes(`×${breakdown.timelineMultiplier}`))).toBe(true);
  });

  it('names a negotiated discount instead of leaving numbers that disagree', () => {
    const discounted = breakdown.totalPrice - 50000;
    const lines = feeAdjustmentLines({
      breakdown, clientTypeLabel: 'Enterprise', timelineLabel: 'Rush', finalTotal: discounted,
    });
    expect(lines.some((l) => l.label.includes('discount') && l.label.includes('500'))).toBe(true);
  });

  it('stays silent when everything already reconciles', () => {
    const flat = calculatePrice({
      baseService: 'website', addOns: [], clientType: 'smb', timeline: 'standard',
    });
    const lines = feeAdjustmentLines({
      breakdown: flat, clientTypeLabel: 'SMB', timelineLabel: 'Standard', finalTotal: flat.totalPrice,
    });
    // smb/standard multipliers may or may not be 1.0 — assert no phantom
    // discount line, which is the invariant that matters.
    expect(lines.some((l) => l.label.includes('discount'))).toBe(false);
  });
});
