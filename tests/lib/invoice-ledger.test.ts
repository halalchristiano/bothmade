import { describe, expect, it } from 'vitest';
import {
  CHASE_AFTER_DAYS,
  FILTER_STATUS,
  ageBand,
  chaseLine,
  daysOutstanding,
  matchesFilter,
  matchesQuery,
  stateTone,
} from '@/lib/invoice-ledger';

/**
 * The invoices card was a hundred rows newest-first with no totals, no filter
 * and no search — so every question anybody opens it with was answered by
 * scrolling and adding up in your head.
 *
 * What's pinned here is the reading: which invoices a bucket contains, how
 * somebody finds one they half remember, and the two facts an open invoice has
 * to carry — how long it has been sitting there, and whether anybody has
 * actually asked about it.
 */

const NOW = new Date('2026-03-01T12:00:00Z');

function invoice(overrides: Partial<Parameters<typeof matchesQuery>[0]> = {}) {
  return {
    number: 'BM-2026-0007',
    description: 'Second round of homepage design',
    status: 'open',
    amountCents: 120000,
    refundedCents: 0,
    createdAt: '2026-02-25T10:00:00Z',
    client: { company: 'Acme Dental' },
    project: { name: 'Acme — Website' },
    ...overrides,
  };
}

describe('the buckets', () => {
  it('sends each one to the server as a status, so old invoices are not dropped by a recency cap', () => {
    expect(FILTER_STATUS.chase).toBe('open');
    expect(FILTER_STATUS.paid).toBe('paid');
    expect(FILTER_STATUS.cancelled).toBe('void');
    expect(FILTER_STATUS.all).toBeNull();
  });

  it('only counts an open invoice as needing chasing', () => {
    expect(matchesFilter({ status: 'open' }, 'chase')).toBe(true);
    expect(matchesFilter({ status: 'paid' }, 'chase')).toBe(false);
    expect(matchesFilter({ status: 'void' }, 'chase')).toBe(false);
    expect(matchesFilter({ status: 'void' }, 'all')).toBe(true);
  });
});

describe('finding one invoice', () => {
  /*
   * The three ways somebody arrives looking for one: a number off a bank
   * statement, a company name off a phone call, a half-remembered description
   * of the work. All three are on the row, so all three should find it.
   */
  it('matches the number, the company, the project and what it was for', () => {
    expect(matchesQuery(invoice(), '0007')).toBe(true);
    expect(matchesQuery(invoice(), 'acme dental')).toBe(true);
    expect(matchesQuery(invoice(), 'homepage')).toBe(true);
    expect(matchesQuery(invoice(), 'Website')).toBe(true);
    expect(matchesQuery(invoice(), 'plumbing')).toBe(false);
  });

  it('shows everything when nothing has been typed', () => {
    expect(matchesQuery(invoice(), '')).toBe(true);
    expect(matchesQuery(invoice(), '   ')).toBe(true);
  });
});

describe('how long it has been sitting there', () => {
  it('counts whole days since it was raised', () => {
    expect(daysOutstanding({ status: 'open', createdAt: '2026-02-25T10:00:00Z' }, NOW)).toBe(4);
    expect(daysOutstanding({ status: 'open', createdAt: '2026-03-01T09:00:00Z' }, NOW)).toBe(0);
  });

  /*
   * A settled invoice's age is trivia, and showing it beside one that has been
   * open for a month makes both look the same.
   */
  it('says nothing about an invoice that is paid or cancelled', () => {
    expect(daysOutstanding({ status: 'paid', createdAt: '2026-01-01T00:00:00Z' }, NOW)).toBeNull();
    expect(daysOutstanding({ status: 'void', createdAt: '2026-01-01T00:00:00Z' }, NOW)).toBeNull();
  });

  it('never reports a negative age from a clock that disagrees', () => {
    expect(daysOutstanding({ status: 'open', createdAt: '2026-03-05T00:00:00Z' }, NOW)).toBe(0);
  });

  it('escalates the band at two weeks and again at four', () => {
    expect(ageBand(1)).toBe('fresh');
    expect(ageBand(CHASE_AFTER_DAYS - 1)).toBe('fresh');
    expect(ageBand(CHASE_AFTER_DAYS)).toBe('ageing');
    expect(ageBand(CHASE_AFTER_DAYS * 2)).toBe('stale');
    expect(ageBand(null)).toBeNull();
  });
});

describe('the chase line', () => {
  /*
   * Both halves, because neither is enough alone: nineteen days with three
   * reminders sent is a client ignoring you, nineteen days with none is an
   * invoice nobody remembered to send, and those want opposite responses.
   */
  it('says how long and how many times, together', () => {
    expect(chaseLine({ status: 'open', createdAt: '2026-02-25T10:00:00Z', sendCount: 0 }, NOW)).toBe(
      'open 4 days · never emailed'
    );
    expect(chaseLine({ status: 'open', createdAt: '2026-02-28T10:00:00Z', sendCount: 1 }, NOW)).toBe(
      'open 1 day · sent once'
    );
    expect(chaseLine({ status: 'open', createdAt: '2026-03-01T10:00:00Z', sendCount: 3 }, NOW)).toBe(
      'raised today · sent 3×'
    );
  });

  it('says nothing about an invoice that is no longer a request for money', () => {
    expect(chaseLine({ status: 'paid', createdAt: '2026-01-01T00:00:00Z' }, NOW)).toBeNull();
  });

  /*
   * Rows written before sends were counted have no sendCount. Reading that as
   * "never emailed" is the honest answer — nobody can say otherwise.
   */
  it('reads a row from before sends were counted as never emailed', () => {
    expect(chaseLine({ status: 'open', createdAt: '2026-02-25T10:00:00Z' }, NOW)).toContain(
      'never emailed'
    );
  });
});

describe('badge tones', () => {
  it('keeps money-came-back visually apart from paid and from cancelled', () => {
    expect(stateTone('paid')).toBe('emerald');
    expect(stateTone('open')).toBe('amber');
    expect(stateTone('void')).toBe('neutral');
    expect(stateTone('refunded')).toBe('purple');
    expect(stateTone('part-refunded')).toBe('purple');
    expect(stateTone('credited')).toBe('purple');
  });
});
