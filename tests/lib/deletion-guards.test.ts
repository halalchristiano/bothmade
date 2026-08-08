import { describe, expect, it } from 'vitest';
import {
  accountingHold,
  accountingHoldReason,
  bulkDeletePhrase,
  matchesBulkDeletePhrase,
} from '@/lib/deletion-guards';

/**
 * lib/deletion-guards.ts is the only thing standing between a click and an
 * irreversible cascade, and it had no test of any kind.
 *
 * Three routes destroy data through it: deleting one project, deleting up to
 * fifty at once, and deleting the client they hang off. A project takes eleven
 * tables with it; a client takes every project. The module exists precisely
 * because those three routes used to disagree — the client delete refused
 * nothing, which made it the documented way around the project guard, and the
 * project guard itself read `_count.payments` alone so an invoiced-but-unpaid
 * project deleted cleanly and took its invoices with it.
 *
 * Code written to close a data-loss hole, guarding the most destructive
 * actions in the admin, with nothing asserting it still does. These are the
 * properties that have to hold.
 */

describe('what may not be deleted', () => {
  it('allows a project with nothing recorded against it', () => {
    expect(accountingHold('Northgate Dental', { payments: 0, invoices: 0 })).toBeNull();
  });

  it('blocks on a payment', () => {
    const reason = accountingHold('Northgate Dental', { payments: 1, invoices: 0 });
    expect(reason).toContain('1 payment');
    expect(reason).toContain('Northgate Dental');
  });

  it('blocks on an invoice with no payment — the case that used to slip through', () => {
    // The original guard read payments alone. Charge raised, client has not
    // paid yet, which is the most likely state a real engagement is in: it
    // deleted cleanly and took the numbered invoice with it.
    const reason = accountingHold('Northgate Dental', { payments: 0, invoices: 1 });
    expect(reason).not.toBeNull();
    expect(reason).toContain('1 invoice');
  });

  it('names both when both exist', () => {
    const reason = accountingHold('Northgate Dental', { payments: 2, invoices: 3 });
    expect(reason).toContain('2 payments');
    expect(reason).toContain('3 invoices');
    expect(reason).toContain('and');
  });

  it('gets the singular and plural right, since this is read by a person', () => {
    expect(accountingHold('X', { payments: 1, invoices: 0 })).toContain('1 payment ');
    expect(accountingHold('X', { payments: 2, invoices: 0 })).toContain('2 payments');
    expect(accountingHold('X', { payments: 0, invoices: 1 })).toContain('1 invoice ');
    expect(accountingHold('X', { payments: 0, invoices: 2 })).toContain('2 invoices');
  });

  it('says what to do instead of only refusing', () => {
    // The string is shown verbatim to whoever pressed the button; a refusal
    // with no route forward is how people go looking for a way around it.
    const reason = accountingHold('Northgate Dental', { payments: 1, invoices: 0 })!;
    expect(reason).toMatch(/decommission/i);
  });
});

describe('the short reason, for a row in a list', () => {
  it('is null when nothing is held', () => {
    expect(accountingHoldReason({ payments: 0, invoices: 0 })).toBeNull();
  });

  it('agrees with the long form about whether anything is held', () => {
    // Two functions, one rule. A row reported as deletable in the bulk list
    // while the single-delete route refuses it would send someone in a circle.
    for (const counts of [
      { payments: 0, invoices: 0 },
      { payments: 1, invoices: 0 },
      { payments: 0, invoices: 1 },
      { payments: 4, invoices: 7 },
    ]) {
      const long = accountingHold('X', counts);
      const short = accountingHoldReason(counts);
      expect(short === null, JSON.stringify(counts)).toBe(long === null);
    }
  });

  it('lists the counts without the surrounding sentence', () => {
    expect(accountingHoldReason({ payments: 2, invoices: 1 })).toBe('2 payments and 1 invoice');
  });
});

describe('the phrase that confirms a bulk delete', () => {
  it('carries the count, so it cannot be typed before the selection is made', () => {
    expect(bulkDeletePhrase(6)).toBe('delete 6 projects');
    expect(bulkDeletePhrase(1)).toBe('delete 1 project');
  });

  it('accepts the exact phrase', () => {
    expect(matchesBulkDeletePhrase('delete 6 projects', 6)).toBe(true);
  });

  it('disarms the moment the selection changes underneath it', () => {
    // The load-bearing property. Type the phrase for six, tick a seventh row,
    // and the button must stop matching rather than quietly taking the extra
    // project.
    expect(matchesBulkDeletePhrase('delete 6 projects', 7)).toBe(false);
    expect(matchesBulkDeletePhrase('delete 6 projects', 5)).toBe(false);
  });

  it('ignores case and stray whitespace, because the point is proving you read it', () => {
    expect(matchesBulkDeletePhrase('DELETE 6 PROJECTS', 6)).toBe(true);
    expect(matchesBulkDeletePhrase('  delete   6   projects  ', 6)).toBe(true);
  });

  it('refuses a near miss rather than guessing what was meant', () => {
    for (const typed of [
      'delete 6 project',
      'delete six projects',
      'delete 6 projects!',
      'delete projects',
      'delete 6',
      '',
    ]) {
      expect(matchesBulkDeletePhrase(typed, 6), `accepted "${typed}"`).toBe(false);
    }
  });

  it('refuses anything that is not a string, rather than throwing', () => {
    // The value arrives from a JSON request body, so it can be any shape at
    // all. A throw here would be a 500 on a destructive endpoint.
    for (const typed of [null, undefined, 6, {}, [], true]) {
      expect(() => matchesBulkDeletePhrase(typed, 6)).not.toThrow();
      expect(matchesBulkDeletePhrase(typed, 6)).toBe(false);
    }
  });

  it('round-trips its own phrase for every count a request can carry', () => {
    // MAX_PROJECTS is 50 in the route. Generating the phrase and matching it
    // must agree across the whole range, including the singular at 1.
    for (let n = 1; n <= 50; n += 1) {
      expect(matchesBulkDeletePhrase(bulkDeletePhrase(n), n), `count ${n}`).toBe(true);
      expect(matchesBulkDeletePhrase(bulkDeletePhrase(n), n + 1), `count ${n} vs ${n + 1}`).toBe(false);
    }
  });
});
