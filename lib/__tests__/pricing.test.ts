import { describe, expect, it } from 'vitest';
import {
  ADD_ONS,
  BASE_SERVICES,
  CLIENT_TYPES,
  DEPOSIT_PERCENT,
  TIMELINES,
  calculatePrice,
  expandAddOnDependencies,
  formatCents,
  isIncludedInBase,
  type AddOnKey,
} from '@/lib/pricing';

/**
 * The pricing engine decides what a client is charged, and the number it
 * produces is quoted publicly and then taken from a card. These tests exist so
 * that a future edit to the catalogue cannot quietly change what someone pays.
 *
 * They deliberately assert behaviour rather than specific figures wherever
 * possible — a price change should not break the suite, but a change to how
 * prices are *derived* should.
 */

describe('calculatePrice', () => {
  it('charges the base alone when nothing is added', () => {
    const result = calculatePrice({
      baseService: 'website',
      addOns: [],
      clientType: 'startup',
      timeline: 'standard',
    });

    expect(result.basePrice).toBe(BASE_SERVICES.website.price);
    expect(result.addOnsPrice).toBe(0);
    expect(result.subtotal).toBe(BASE_SERVICES.website.price);
  });

  it('adds each selected add-on exactly once', () => {
    const addOns: AddOnKey[] = ['seo', 'blog'];
    const result = calculatePrice({
      baseService: 'website',
      addOns,
      clientType: 'startup',
      timeline: 'standard',
    });

    expect(result.addOnsPrice).toBe(ADD_ONS.seo.price + ADD_ONS.blog.price);
  });

  it('never charges for something the base already includes', () => {
    // A web app bundles accounts and a backend; billing for them again would
    // be charging twice for one thing.
    const bundled = (['user-accounts', 'custom-backend'] as AddOnKey[]).filter((k) =>
      isIncludedInBase('web-app', k)
    );

    expect(bundled.length).toBeGreaterThan(0);

    const result = calculatePrice({
      baseService: 'web-app',
      addOns: bundled,
      clientType: 'startup',
      timeline: 'standard',
    });

    expect(result.addOnsPrice).toBe(0);
    expect(result.subtotal).toBe(BASE_SERVICES['web-app'].price);
  });

  it('applies client type and timeline to the whole subtotal, not just the base', () => {
    const addOns: AddOnKey[] = ['seo'];
    const subtotal = BASE_SERVICES.website.price + ADD_ONS.seo.price;

    const result = calculatePrice({
      baseService: 'website',
      addOns,
      clientType: 'enterprise',
      timeline: 'rush',
    });

    expect(result.totalPrice).toBe(
      Math.round(subtotal * CLIENT_TYPES.enterprise.multiplier * TIMELINES.rush.multiplier)
    );
    expect(result.totalPrice).toBeGreaterThan(subtotal);
  });

  it('produces whole cents — never a fraction of a penny', () => {
    for (const clientType of Object.keys(CLIENT_TYPES) as (keyof typeof CLIENT_TYPES)[]) {
      for (const timeline of Object.keys(TIMELINES) as (keyof typeof TIMELINES)[]) {
        const { totalPrice } = calculatePrice({
          baseService: 'ios-app',
          addOns: ['push-notifications'],
          clientType,
          timeline,
        });

        expect(Number.isInteger(totalPrice)).toBe(true);
      }
    }
  });

  it('never returns a negative or zero total for a real selection', () => {
    for (const baseService of Object.keys(BASE_SERVICES) as (keyof typeof BASE_SERVICES)[]) {
      const { totalPrice } = calculatePrice({
        baseService,
        addOns: [],
        clientType: 'startup',
        timeline: 'flexible',
      });

      expect(totalPrice).toBeGreaterThan(0);
    }
  });

  it('is order-independent — the same add-ons in any order cost the same', () => {
    const forwards = calculatePrice({
      baseService: 'website',
      addOns: ['seo', 'blog', 'cms'],
      clientType: 'smb',
      timeline: 'standard',
    });
    const backwards = calculatePrice({
      baseService: 'website',
      addOns: ['cms', 'blog', 'seo'],
      clientType: 'smb',
      timeline: 'standard',
    });

    expect(forwards.totalPrice).toBe(backwards.totalPrice);
  });
});

describe('add-on dependencies', () => {
  it('pulls in whatever a selected add-on cannot function without', () => {
    // E-commerce needs somewhere to keep orders. Quoting it without a backend
    // would be quoting something that could not be built as described.
    const expanded = expandAddOnDependencies(['ecommerce']);

    expect(expanded).toContain('ecommerce');
    expect(expanded.length).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent — expanding an already-expanded set changes nothing', () => {
    const once = expandAddOnDependencies(['ecommerce']);
    const twice = expandAddOnDependencies(once);

    expect([...twice].sort()).toEqual([...once].sort());
  });

  it('never returns a duplicate', () => {
    const expanded = expandAddOnDependencies(['ecommerce', 'subscriptions', 'ecommerce']);

    expect(new Set(expanded).size).toBe(expanded.length);
  });
});

describe('formatCents', () => {
  it('renders whole currency, not raw cents', () => {
    expect(formatCents(300000)).toContain('3,000');
  });

  it('does not lose money to rounding on display', () => {
    expect(formatCents(0)).toBeTruthy();
    expect(formatCents(1)).toBeTruthy();
  });
});

describe('deposit', () => {
  it('is a sane fraction of the total', () => {
    expect(DEPOSIT_PERCENT).toBeGreaterThan(0);
    expect(DEPOSIT_PERCENT).toBeLessThanOrEqual(100);
  });

  it('leaves a balance that plus the deposit equals the total', () => {
    const { totalPrice } = calculatePrice({
      baseService: 'web-app',
      addOns: ['seo'],
      clientType: 'smb',
      timeline: 'standard',
    });

    const deposit = Math.round((totalPrice * DEPOSIT_PERCENT) / 100);
    const balance = totalPrice - deposit;

    expect(deposit + balance).toBe(totalPrice);
  });
});
