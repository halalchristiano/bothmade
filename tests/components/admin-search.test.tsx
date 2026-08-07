import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBox } from '@/app/admin/layout';

/**
 * Search is one of the few things here that gets reached for under pressure —
 * the phone is ringing and the number on it needs a name. Two things were
 * wrong with it.
 *
 * THE RACE. Only the debounce timer was cancelled between keystrokes. A
 * request already in flight was left running, so a slow answer for "lin"
 * could land after a fast one for "linp" and overwrite it: the list showing
 * matches for a query the box no longer contained.
 *
 * THE LIE. "No matches." rendered the instant a second character was typed,
 * while the request for it was still going out. Every search said there was
 * nothing before it said what there was.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const result = (title: string) => ({
  type: 'lead' as const,
  id: title,
  title,
  subtitle: null,
  href: `/admin/leads/${title}`,
});

beforeEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

/** Answers each query only when `release(query)` is called for it. */
function deferredFetch() {
  const pending = new Map<string, (results: unknown[]) => void>();
  const aborted: string[] = [];
  const fetchMock = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
    const query = new URL(url, 'http://t').searchParams.get('q') ?? '';
    return new Promise((resolve, reject) => {
      pending.set(query, (results) =>
        resolve({ ok: true, json: async () => ({ success: true, results }) })
      );
      init?.signal?.addEventListener('abort', () => {
        aborted.push(query);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    aborted,
    release: (query: string, results: unknown[]) => pending.get(query)?.(results),
    isPending: (query: string) => pending.has(query),
  };
}

describe('while the answer is still coming', () => {
  it('says it is searching rather than that there is nothing', async () => {
    deferredFetch();
    render(<SearchBox />);

    await userEvent.type(screen.getByRole('combobox'), 'lin');

    await waitFor(() => expect(screen.getByText('Searching…')).toBeInTheDocument());
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });

  it('says there are no matches once an empty answer actually arrives', async () => {
    const { release, isPending } = deferredFetch();
    render(<SearchBox />);

    await userEvent.type(screen.getByRole('combobox'), 'lin');
    await waitFor(() => expect(isPending('lin')).toBe(true));
    release('lin', []);

    await waitFor(() => expect(screen.getByText('No matches.')).toBeInTheDocument());
  });
});

describe('when a slower answer for an older query comes back last', () => {
  it('aborts the superseded request instead of letting it overwrite', async () => {
    const { release, aborted, isPending } = deferredFetch();
    render(<SearchBox />);
    const box = screen.getByRole('combobox');

    await userEvent.type(box, 'lin');
    await waitFor(() => expect(isPending('lin')).toBe(true));

    // A fourth character, while "lin" is still out.
    await userEvent.type(box, 'p');
    await waitFor(() => expect(isPending('linp')).toBe(true));
    await waitFor(() => expect(aborted).toContain('lin'));

    release('linp', [result('Linpotia Dental')]);
    await screen.findByText('Linpotia Dental');

    // The stale answer, arriving last. It must not reach the list.
    release('lin', [result('Lincoln Roofing')]);

    await waitFor(() => expect(screen.getByText('Linpotia Dental')).toBeInTheDocument());
    expect(screen.queryByText('Lincoln Roofing')).not.toBeInTheDocument();
  });
});

describe('the query the server is asked', () => {
  it('is the whole trimmed query, once, rather than one request per keystroke', async () => {
    const { fetchMock, isPending } = deferredFetch();
    render(<SearchBox />);

    await userEvent.type(screen.getByRole('combobox'), 'linpotia');
    await waitFor(() => expect(isPending('linpotia')).toBe(true));

    const queries = fetchMock.mock.calls.map(
      ([url]) => new URL(url as string, 'http://t').searchParams.get('q')
    );
    expect(queries.at(-1)).toBe('linpotia');
    // Debounced: nowhere near one request per character typed.
    expect(fetchMock.mock.calls.length).toBeLessThan('linpotia'.length);
  });

  it('is not asked at all for a single character', async () => {
    const { fetchMock } = deferredFetch();
    render(<SearchBox />);

    await userEvent.type(screen.getByRole('combobox'), 'l');

    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
