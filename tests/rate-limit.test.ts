import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limit';

describe('sliding-window rate limit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('limits after max attempts and reports honest retry-after', () => {
    const w = { max: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) expect(checkRateLimit('t', 'k1', w).limited).toBe(false);
    const hit = checkRateLimit('t', 'k1', w);
    expect(hit.limited).toBe(true);
    expect(hit.retryAfterSeconds).toBeGreaterThan(0);
    expect(hit.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('slides: old attempts age out', () => {
    const w = { max: 2, windowMs: 60_000 };
    checkRateLimit('t', 'k2', w);
    checkRateLimit('t', 'k2', w);
    expect(checkRateLimit('t', 'k2', w).limited).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit('t', 'k2', w).limited).toBe(false);
  });

  it('clear resets the count, so a good login costs nothing', () => {
    const w = { max: 1, windowMs: 60_000 };
    checkRateLimit('t', 'k3', w);
    clearRateLimit('t', 'k3');
    expect(checkRateLimit('t', 'k3', w).limited).toBe(false);
  });

  it('keys are independent', () => {
    const w = { max: 1, windowMs: 60_000 };
    checkRateLimit('t', 'a', w);
    expect(checkRateLimit('t', 'b', w).limited).toBe(false);
  });
});
