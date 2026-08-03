import { describe, expect, it } from 'vitest';
import { pageMeta, parsePageParams, searchFilter } from '@/lib/pagination';

describe('parsePageParams', () => {
  const parse = (q: string) => parsePageParams(new URLSearchParams(q));
  it('defaults sanely and clamps abuse', () => {
    expect(parse('')).toMatchObject({ page: 1, skip: 0 });
    expect(parse('page=-5&pageSize=99999').pageSize).toBeLessThanOrEqual(200);
    expect(parse('page=abc').page).toBe(1);
  });
  it('computes skip from page', () => {
    expect(parse('page=3&pageSize=50').skip).toBe(100);
  });
});

describe('pageMeta', () => {
  it('reports hasMore truthfully at the boundary', () => {
    const params = parsePageParams(new URLSearchParams('page=2&pageSize=50'));
    expect(pageMeta(params, 100).hasMore).toBe(false);
    expect(pageMeta(params, 101).hasMore).toBe(true);
    expect(pageMeta(params, 0).totalPages).toBe(1);
  });
});

describe('searchFilter', () => {
  it('is undefined for empty queries so it spreads cleanly', () => {
    expect(searchFilter(null, ['company'])).toBeUndefined();
    expect(searchFilter('   ', ['company'])).toBeUndefined();
  });
  it('builds a case-insensitive OR across fields', () => {
    const f = searchFilter('acme', ['company', 'email'] as const);
    expect(f?.OR).toHaveLength(2);
    expect(f?.OR[0].company).toEqual({ contains: 'acme', mode: 'insensitive' });
  });
});
