import { describe, expect, it } from 'vitest';
import {
  ADD_ONS,
  ADD_ON_REQUIRES,
  BASE_SERVICES,
  CLIENT_TYPES,
  DEPOSIT_PERCENT,
  MAX_DISCOUNT_PERCENT,
  TIMELINES,
  calculatePrice,
  customItemsTotal,
  dependentsOf,
  depositAmount,
  expandAddOnDependencies,
  formatCents,
  isAddOnKey,
  isBaseService,
  isClientType,
  isIncludedInBase,
  isTimelineKey,
  minAllowedPrice,
  sanitizeCustomItems,
  withBaseIncludes,
  type AddOnKey,
} from '@/lib/pricing';

/**
 * Everything here is the number a client is actually charged. A silent
 * regression in this file is money — either quoted below cost or a double
 * charge for something the base price already covered — so the assertions
 * are on concrete amounts, not on "it returns a number".
 */

describe('calculatePrice', () => {
  it('is base + add-ons when neither multiplier moves the price', () => {
    const breakdown = calculatePrice({
      baseService: 'website',
      addOns: ['seo'],
      clientType: 'smb', // ×1
      timeline: 'standard', // ×1
    });

    expect(breakdown.basePrice).toBe(BASE_SERVICES.website.price);
    expect(breakdown.addOnsPrice).toBe(ADD_ONS.seo.price);
    expect(breakdown.subtotal).toBe(BASE_SERVICES.website.price + ADD_ONS.seo.price);
    expect(breakdown.totalPrice).toBe(breakdown.subtotal);
  });

  it('applies the client-type and timeline multipliers together', () => {
    const breakdown = calculatePrice({
      baseService: 'website',
      addOns: [],
      clientType: 'enterprise', // ×1.25
      timeline: 'rush', // ×1.2
    });

    // $3,000 × 1.25 × 1.2 = $4,500
    expect(breakdown.totalPrice).toBe(450000);
    expect(breakdown.clientTypeMultiplier).toBe(1.25);
    expect(breakdown.timelineMultiplier).toBe(1.2);
  });

  it('discounts a flexible startup rather than inflating it', () => {
    const breakdown = calculatePrice({
      baseService: 'website',
      addOns: [],
      clientType: 'startup', // ×0.9
      timeline: 'flexible', // ×0.95
    });

    expect(breakdown.totalPrice).toBeLessThan(breakdown.subtotal);
    expect(breakdown.totalPrice).toBe(Math.round(300000 * 0.9 * 0.95));
  });

  it('returns a whole number of cents — a fractional cent cannot be charged', () => {
    for (const clientType of Object.keys(CLIENT_TYPES) as (keyof typeof CLIENT_TYPES)[]) {
      for (const timeline of Object.keys(TIMELINES) as (keyof typeof TIMELINES)[]) {
        const { totalPrice } = calculatePrice({
          baseService: 'web-app',
          addOns: ['seo', 'analytics', 'blog'],
          clientType,
          timeline,
        });
        expect(Number.isInteger(totalPrice)).toBe(true);
      }
    }
  });

  it('charges nothing extra for an add-on the base service already includes', () => {
    const withoutIt = calculatePrice({
      baseService: 'web-app',
      addOns: [],
      clientType: 'smb',
      timeline: 'standard',
    });
    // 'custom-backend' and 'user-accounts' are bundled into a Web App's price.
    const withIt = calculatePrice({
      baseService: 'web-app',
      addOns: ['custom-backend', 'user-accounts'],
      clientType: 'smb',
      timeline: 'standard',
    });

    expect(withIt.addOnsPrice).toBe(0);
    expect(withIt.totalPrice).toBe(withoutIt.totalPrice);
  });

  it('still charges for a backend bolted onto a plain website', () => {
    const breakdown = calculatePrice({
      baseService: 'website',
      addOns: ['custom-backend'],
      clientType: 'smb',
      timeline: 'standard',
    });

    expect(breakdown.addOnsPrice).toBe(ADD_ONS['custom-backend'].price);
  });

  it('is order-independent across the selected add-ons', () => {
    const a = calculatePrice({
      baseService: 'website',
      addOns: ['seo', 'blog', 'cms'],
      clientType: 'smb',
      timeline: 'standard',
    });
    const b = calculatePrice({
      baseService: 'website',
      addOns: ['cms', 'seo', 'blog'],
      clientType: 'smb',
      timeline: 'standard',
    });

    expect(a.totalPrice).toBe(b.totalPrice);
  });
});

describe('isIncludedInBase / withBaseIncludes', () => {
  it('treats a Web App as already having a backend and accounts', () => {
    expect(isIncludedInBase('web-app', 'custom-backend')).toBe(true);
    expect(isIncludedInBase('web-app', 'user-accounts')).toBe(true);
  });

  it('does not treat a plain website the same way', () => {
    expect(isIncludedInBase('website', 'custom-backend')).toBe(false);
    expect(isIncludedInBase('website', 'user-accounts')).toBe(false);
  });

  it('merges the bundled add-ons in without duplicating an existing pick', () => {
    const merged = withBaseIncludes('web-app', ['seo', 'custom-backend']);

    expect(merged).toContain('seo');
    expect(merged.filter((k) => k === 'custom-backend')).toHaveLength(1);
    expect(merged).toContain('user-accounts');
  });

  it('leaves the selection alone for a base service that bundles nothing', () => {
    expect(withBaseIncludes('website', ['seo'])).toEqual(['seo']);
  });
});

describe('expandAddOnDependencies', () => {
  it('pulls in what an add-on silently needs to work at all', () => {
    // Nobody can buy e-commerce without somewhere to keep the orders.
    expect(expandAddOnDependencies(['ecommerce'])).toContain('custom-backend');
  });

  it('resolves transitively, not just one level deep', () => {
    const expanded = expandAddOnDependencies(['subscriptions']);
    expect(expanded).toEqual(expect.arrayContaining(['custom-backend', 'user-accounts']));
  });

  it('is idempotent — expanding an expanded set changes nothing', () => {
    const once = expandAddOnDependencies(['ecommerce', 'booking']);
    const twice = expandAddOnDependencies(once);
    expect([...twice].sort()).toEqual([...once].sort());
  });

  it('terminates and covers every declared dependency in the catalogue', () => {
    for (const [key, requires] of Object.entries(ADD_ON_REQUIRES) as [AddOnKey, AddOnKey[]][]) {
      const expanded = expandAddOnDependencies([key]);
      for (const req of requires) expect(expanded).toContain(req);
    }
  });
});

describe('dependentsOf', () => {
  it('names what would break if a foundation were unticked', () => {
    const dependents = dependentsOf('custom-backend', ['ecommerce', 'seo', 'custom-backend']);

    expect(dependents).toContain('ecommerce');
    expect(dependents).not.toContain('seo');
  });

  it('never lists the key itself', () => {
    expect(dependentsOf('custom-backend', ['custom-backend'])).toEqual([]);
  });
});

describe('deposit and discount floors', () => {
  it('takes exactly half up front', () => {
    expect(DEPOSIT_PERCENT).toBe(50);
    expect(depositAmount(500000)).toBe(250000);
  });

  it('rounds an odd deposit to a whole cent', () => {
    expect(depositAmount(333333)).toBe(166667);
    expect(Number.isInteger(depositAmount(333333))).toBe(true);
  });

  it('lets a quote be discounted, but not gutted', () => {
    expect(MAX_DISCOUNT_PERCENT).toBe(15);
    expect(minAllowedPrice(1000000)).toBe(850000);
  });

  it('never lets the floor exceed the calculated price', () => {
    for (const total of [1, 999, 100000, 2000000]) {
      expect(minAllowedPrice(total)).toBeLessThanOrEqual(total);
    }
  });
});

describe('sanitizeCustomItems', () => {
  it('keeps a well-formed item', () => {
    expect(sanitizeCustomItems([{ label: 'Photography day', priceCents: 45000 }])).toEqual([
      { label: 'Photography day', priceCents: 45000 },
    ]);
  });

  it('refuses anything that is not an array', () => {
    expect(sanitizeCustomItems(null)).toEqual([]);
    expect(sanitizeCustomItems('[]')).toEqual([]);
    expect(sanitizeCustomItems({ label: 'x', priceCents: 1 })).toEqual([]);
  });

  it('drops a bad item instead of throwing away the rest of the proposal', () => {
    const items = sanitizeCustomItems([
      { label: 'Good', priceCents: 1000 },
      { label: '', priceCents: 1000 },
      { label: 'No price' },
      null,
      'nope',
      { label: 'Also good', priceCents: 2000 },
    ]);

    expect(items).toEqual([
      { label: 'Good', priceCents: 1000 },
      { label: 'Also good', priceCents: 2000 },
    ]);
  });

  it('rejects prices that would take money off the total', () => {
    expect(sanitizeCustomItems([{ label: 'Refund', priceCents: -5000 }])).toEqual([]);
    expect(sanitizeCustomItems([{ label: 'Free', priceCents: 0 }])).toEqual([]);
  });

  it('rejects non-finite prices rather than propagating NaN into the total', () => {
    expect(sanitizeCustomItems([{ label: 'Broken', priceCents: NaN }])).toEqual([]);
    expect(sanitizeCustomItems([{ label: 'Broken', priceCents: Infinity }])).toEqual([]);
    expect(sanitizeCustomItems([{ label: 'Broken', priceCents: '5000' }])).toEqual([]);
  });

  it('rounds a fractional price to whole cents', () => {
    expect(sanitizeCustomItems([{ label: 'Odd', priceCents: 1000.6 }])).toEqual([
      { label: 'Odd', priceCents: 1001 },
    ]);
  });

  it('trims and caps a runaway label', () => {
    const [item] = sanitizeCustomItems([{ label: `  ${'x'.repeat(500)}  `, priceCents: 100 }]);
    expect(item.label).toHaveLength(200);
  });

  it('caps the list at 20 items', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ label: `Item ${i}`, priceCents: 100 }));
    expect(sanitizeCustomItems(many)).toHaveLength(20);
  });
});

describe('customItemsTotal', () => {
  it('sums the items', () => {
    expect(customItemsTotal([{ label: 'a', priceCents: 1500 }, { label: 'b', priceCents: 2500 }])).toBe(4000);
  });

  it('is zero for an empty list', () => {
    expect(customItemsTotal([])).toBe(0);
  });
});

describe('formatCents', () => {
  it('renders whole dollars with no cents', () => {
    expect(formatCents(300000)).toBe('$3,000');
    expect(formatCents(0)).toBe('$0');
  });
});

describe('catalogue integrity', () => {
  it('prices every add-on and base service above zero', () => {
    for (const [key, service] of Object.entries(BASE_SERVICES)) {
      expect(service.price, `base service ${key}`).toBeGreaterThan(0);
    }
    for (const [key, addOn] of Object.entries(ADD_ONS)) {
      expect(addOn.price, `add-on ${key}`).toBeGreaterThan(0);
    }
  });

  it('only declares dependencies on add-ons that exist', () => {
    for (const [key, requires] of Object.entries(ADD_ON_REQUIRES)) {
      expect(isAddOnKey(key)).toBe(true);
      for (const req of requires ?? []) expect(isAddOnKey(req)).toBe(true);
    }
  });
});

describe('type guards', () => {
  it('accepts real keys and rejects made-up ones', () => {
    expect(isBaseService('website')).toBe(true);
    expect(isBaseService('spaceship')).toBe(false);
    expect(isAddOnKey('seo')).toBe(true);
    expect(isAddOnKey('free-money')).toBe(false);
    expect(isClientType('enterprise')).toBe(true);
    expect(isClientType('mega-corp')).toBe(false);
    expect(isTimelineKey('rush')).toBe(true);
    expect(isTimelineKey('yesterday')).toBe(false);
  });

  it('is not fooled by inherited Object properties', () => {
    // `value in ADD_ONS` walks the prototype chain, so these must not pass.
    expect(isAddOnKey('toString')).toBe(false);
    expect(isBaseService('constructor')).toBe(false);
    expect(isClientType('hasOwnProperty')).toBe(false);
    expect(isTimelineKey('valueOf')).toBe(false);
  });
});
