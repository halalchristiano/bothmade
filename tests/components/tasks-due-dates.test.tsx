import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksWidget } from '@/components/admin/TasksWidget';

/**
 * Due dates on the studio's to-do list, which had them everywhere except
 * where somebody could use one.
 *
 * `dueAt` is on the model. It is the second key in the GET's orderBy. The
 * create route has always accepted it. And the widget — the only client —
 * posted `{ title }` and rendered `{ title }`, so in practice every task
 * carried null, the sort had nothing to sort on, and the list could not
 * answer "what is due first" about itself.
 *
 * Two halves, and both are needed for either to be worth anything: a field
 * to put a date in, and the date on the row afterwards. A date you can set
 * and never see is a database column with a form attached.
 */

const task = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'task_1',
  title: 'Ring Havisham about the deposit',
  done: false,
  dueAt: null,
  ...over,
});

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

let listed: unknown[];
let created: Record<string, unknown> | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  listed = [];
  created = null;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      created = JSON.parse(String(init.body));
      return {
        ok: true,
        status: 201,
        json: async () => ({ success: true, task: task({ id: 'task_new', ...created }) }),
      } as unknown as Response;
    }
    if (String(url) === '/api/admin/tasks') {
      return { ok: true, status: 200, json: async () => ({ success: true, tasks: listed }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ success: true }) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

/**
 * The task titles, top to bottom. Read off each row's title span rather than
 * by matching text: the due chip sits in the same row and can say the same
 * words, and a test that cannot tell a title from a date label is testing
 * neither.
 */
const titlesInOrder = () =>
  screen
    .getAllByRole('checkbox')
    .map((box) => box.closest('label')?.querySelector('span')?.textContent ?? '');

const open = async () => {
  render(<TasksWidget />);
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
};

describe('setting a due date', () => {
  it('offers a field for one, and does not insist on it', async () => {
    await open();

    const field = screen.getByLabelText(/due date/i) as HTMLInputElement;
    expect(field.type).toBe('date');
    expect(field.required).toBe(false);
  });

  it('sends the date with the task', async () => {
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Add a task'), 'Send the Havisham proposal');
    await user.type(screen.getByLabelText(/due date/i), '2026-09-01');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(created).not.toBeNull());
    expect(created).toEqual({ title: 'Send the Havisham proposal', dueAt: '2026-09-01' });
  });

  /*
   * A caller that does not care about due dates should not look like one
   * that cleared a date. Not sending the key at all is what that looks like.
   */
  it('leaves the key out entirely when no date was given', async () => {
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Add a task'), 'Ring them back');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(created).not.toBeNull());
    expect(created).toEqual({ title: 'Ring them back' });
  });

  it('empties both boxes once it has gone in', async () => {
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Add a task'), 'Chase the mockup');
    await user.type(screen.getByLabelText(/due date/i), '2026-09-01');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(screen.getByLabelText('Add a task')).toHaveValue(''));
    expect(screen.getByLabelText(/due date/i)).toHaveValue('');
  });

  it('says what the server said when it refuses one', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? ({ ok: false, status: 400, json: async () => ({ error: "That due date isn't a date." }) } as unknown as Response)
        : ({ ok: true, status: 200, json: async () => ({ success: true, tasks: [] }) } as unknown as Response)
    );
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Add a task'), 'Something');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/isn't a date/i));
    // The title is the only copy of what was typed.
    expect(screen.getByLabelText('Add a task')).toHaveValue('Something');
  });
});

describe('reading a due date off the row', () => {
  it('says when something is due today', async () => {
    listed = [task({ dueAt: day(0) })];
    await open();

    expect(screen.getByText('Due today')).toBeTruthy();
  });

  it('says how late an overdue one is', async () => {
    listed = [task({ dueAt: day(-3) })];
    await open();

    expect(screen.getByText('3 days overdue')).toBeTruthy();
  });

  it('says nothing at all for a task with no date', async () => {
    listed = [task({ dueAt: null })];
    await open();

    expect(screen.queryByText(/^Due /)).toBeNull();
    expect(screen.queryByText(/overdue/)).toBeNull();
  });

  /* A finished job is not late, however long it sat there. */
  it('drops the date once the task is done', async () => {
    listed = [task({ dueAt: day(-5), done: true })];
    await open();

    expect(screen.getByText('Ring Havisham about the deposit')).toBeTruthy();
    expect(screen.queryByText(/overdue/)).toBeNull();
  });
});

describe('where a new task lands', () => {
  /*
   * The list is ordered by what is due first. A new task appended to the top
   * regardless would be the widget contradicting its own sort — and the sort
   * is the entire reason the date is worth setting.
   */
  it('goes below one that is due sooner, not on top of it', async () => {
    listed = [task({ id: 'urgent', title: 'Ring this morning', dueAt: day(0) })];
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Add a task'), 'Do next month');
    await user.type(screen.getByLabelText(/due date/i), '2027-01-04');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(screen.getByText('Do next month')).toBeTruthy());
    expect(titlesInOrder()).toEqual(['Ring this morning', 'Do next month']);
  });

  it('keeps a dateless task below the dated ones', async () => {
    listed = [task({ id: 'dated', title: 'Has a date', dueAt: day(1) })];
    const user = userEvent.setup();
    await open();

    await user.type(screen.getByLabelText('Add a task'), 'Whenever');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(screen.getByText('Whenever')).toBeTruthy());
    expect(titlesInOrder()).toEqual(['Has a date', 'Whenever']);
  });
});
