import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * What the unsubscribe page tells somebody, against what the record says.
 *
 * `stopped` was `lead.doNotContact || done === '1'`, and that `||` only ever
 * changes the answer when the column is false — which is exactly the case
 * where we have not stopped. So the query parameter asserted the outcome
 * precisely when the outcome had not happened, on a page that had already
 * read the truth and was holding it. Anyone could open `?done=1` on a live
 * token and be told we had stopped emailing them.
 *
 * There was also no third state. A write that failed looked identical to one
 * that worked, so the one person who could have done something about it —
 * the recipient, by pressing the button again — was told there was nothing
 * left to do.
 */

const findUnique = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { lead: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

const StopPage = (await import('@/app/stop/[token]/page')).default;

/** The page is an async server component; render what it resolves to. */
const show = async (token: string, done?: string) => {
  const ui = await StopPage({
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve(done === undefined ? {} : { done }),
  });
  render(ui);
};

beforeEach(() => {
  findUnique.mockReset().mockResolvedValue({ company: 'Acme Dental', doNotContact: false });
});

describe('the page that says whether we stopped', () => {
  it('says we stopped when the record says we stopped', async () => {
    findUnique.mockResolvedValue({ company: 'Acme Dental', doNotContact: true });
    await show('tok_1', '1');

    expect(screen.getByText(/we’ll stop|we&rsquo;ll stop|that’s done/i)).toBeTruthy();
  });

  it('says it even without the parameter, because the record is the fact', async () => {
    findUnique.mockResolvedValue({ company: 'Acme Dental', doNotContact: true });
    await show('tok_1');

    expect(screen.getByText(/that’s done/i)).toBeTruthy();
  });

  it('refuses to be talked into it by the URL alone', async () => {
    // A live token, still contactable, ?done=1 typed in. It used to print
    // "That's done — we'll stop."
    await show('tok_1', '1');

    expect(screen.queryByText(/that’s done/i)).toBeNull();
    expect(screen.getByText(/stop emailing you\?/i)).toBeTruthy();
  });

  it('says plainly when the write failed, and offers the button again', async () => {
    await show('tok_1', '0');

    expect(screen.getByText(/didn’t go through/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.queryByText(/that’s done/i)).toBeNull();
  });

  it('asks first when nothing has been attempted', async () => {
    await show('tok_1');

    expect(screen.getByText(/stop emailing you\?/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /yes, stop emailing me/i })).toBeTruthy();
  });

  it('still answers an unknown token with the expired link, whatever done says', async () => {
    findUnique.mockResolvedValue(null);
    await show('tok_made_up', '0');

    // Never "that didn't go through" — there was nothing to write, and the
    // answer must not distinguish a real token from an invented one.
    expect(screen.getByText(/that link has expired/i)).toBeTruthy();
    expect(screen.queryByText(/didn’t go through/i)).toBeNull();
  });
});
