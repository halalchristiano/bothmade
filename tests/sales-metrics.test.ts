import { describe, expect, it } from 'vitest';
import { dealValue, leadConversionRate, winRate, wonDate } from '@/lib/sales-metrics';

describe('the two rates that used to share one label', () => {
  it('win rate is won over decided', () => {
    expect(winRate(12, 8)).toBeCloseTo(0.6);
    expect(winRate(0, 0)).toBe(0);
  });
  it('lead conversion is won over everything', () => {
    expect(leadConversionRate(12, 200)).toBeCloseTo(0.06);
    expect(leadConversionRate(5, 0)).toBe(0);
  });
});

describe('dealValue precedence: paid > agreed > guessed', () => {
  it('money received wins', () =>
    expect(dealValue({ paidTotal: 450000, proposalTotalPrice: 500000, estimatedValue: 800000 })).toBe(450000));
  it('agreed price beats the guess', () =>
    expect(dealValue({ paidTotal: 0, proposalTotalPrice: 500000, estimatedValue: 800000 })).toBe(500000));
  it('falls back to the estimate', () =>
    expect(dealValue({ proposalTotalPrice: 0, estimatedValue: 800000 })).toBe(800000));
  it('nothing known is zero, not NaN', () =>
    expect(dealValue({ estimatedValue: null })).toBe(0));
});

describe('wonDate', () => {
  it('prefers the explicit stamp; falls back for legacy rows', () => {
    const won = new Date('2026-03-01');
    const edited = new Date('2026-08-01');
    expect(wonDate({ wonAt: won, updatedAt: edited })).toBe(won);
    expect(wonDate({ wonAt: null, updatedAt: edited })).toBe(edited);
  });
});
