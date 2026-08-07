import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksWidget } from '@/components/admin/TasksWidget';

/**
 * THE BUG. Ticking a task off and removing one both updated the list first
 * and asked the server after — right, because a checkbox that waits on a
 * round trip feels broken. But neither looked at the response. A failed write
 * left the screen showing the change anyway: a task ticked off that was still
 * open, or one removed that was still there, with nothing said and no way to
 * find out until a reload silently put it back.
 *
 * A to-do list that loses a tick is worse than one that is slow to take it.
 */

const TASKS = [
  { id: 't1', title: 'Call the roofer back', done: false, dueAt: null },
  { id: 't2', title: 'Send the Linpotia invoice', done: false, dueAt: null },
];

/** Loads the list, then answers every write with `ok`. */
function mockFetch(writeResponse: () => Promise<{ ok: boolean }> | never) {
  const fetchMock = vi.fn((url: string, init?: { method?: string }) => {
    if (!init?.method || init.method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, tasks: TASKS }),
      });
    }
    return writeResponse();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

async function renderLoaded() {
  render(<TasksWidget />);
  await screen.findByText('Call the roofer back');
}

/**
 * The checkbox belonging to a named task.
 *
 * Not by index: ticking a task moves it out of the pending list and down into
 * "Done", so position identifies a different row after every toggle.
 */
function checkboxFor(title: string): HTMLInputElement {
  const row = screen.getByText(title).closest('label');
  if (!row) throw new Error(`no row for "${title}"`);
  return row.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

function removeButtonFor(title: string): HTMLElement {
  const row = screen.getByText(title).closest('label');
  if (!row) throw new Error(`no row for "${title}"`);
  return row.querySelector('button') as HTMLElement;
}

describe('when the write lands', () => {
  it('keeps the task ticked off', async () => {
    mockFetch(async () => ({ ok: true }));
    await renderLoaded();

    await userEvent.click(checkboxFor('Call the roofer back'));

    await waitFor(() => expect(checkboxFor('Call the roofer back')).toBeChecked());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the removed task gone', async () => {
    mockFetch(async () => ({ ok: true }));
    await renderLoaded();

    await userEvent.click(removeButtonFor('Call the roofer back'));

    await waitFor(() => expect(screen.queryByText('Call the roofer back')).not.toBeInTheDocument());
  });
});

describe('when the write does not land', () => {
  it('un-ticks a task the server refused', async () => {
    mockFetch(async () => ({ ok: false }));
    await renderLoaded();

    await userEvent.click(checkboxFor('Call the roofer back'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/couldn't update/i));
    expect(checkboxFor('Call the roofer back')).not.toBeChecked();
  });

  it('puts back a task the server refused to delete', async () => {
    mockFetch(async () => ({ ok: false }));
    await renderLoaded();

    await userEvent.click(removeButtonFor('Call the roofer back'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/couldn't remove/i));
    expect(screen.getByText('Call the roofer back')).toBeInTheDocument();
  });

  it('puts a deleted task back in its original position, not at the top', async () => {
    mockFetch(async () => ({ ok: false }));
    await renderLoaded();

    // The second row — the one whose position a naive restore would lose.
    await userEvent.click(removeButtonFor('Send the Linpotia invoice'));

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    const titles = screen.getAllByText(/Call the roofer back|Send the Linpotia invoice/);
    expect(titles.map((n) => n.textContent)).toEqual([
      'Call the roofer back',
      'Send the Linpotia invoice',
    ]);
  });

  it('says so when the server cannot be reached at all', async () => {
    mockFetch(() => {
      throw new Error('offline');
    });
    await renderLoaded();

    await userEvent.click(checkboxFor('Call the roofer back'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/could not reach/i));
    expect(checkboxFor('Call the roofer back')).not.toBeChecked();
  });
});
