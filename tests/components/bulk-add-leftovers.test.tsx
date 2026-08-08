import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickAddLeadModal } from '@/components/admin/QuickAddLeadModal';

/**
 * What the paste box does with the companies it could not add.
 *
 * One paste creates at most 200 leads. The route applied that silently and
 * this box compounded it: it reported `Added ${count} companies` in green and
 * then cleared the textarea — so a 250-company paste ended as a success
 * message, 200 leads, and fifty company names that existed nowhere any more.
 * The list they came from had been pasted, not saved, and the paste was gone.
 *
 * The rule now: the box is only emptied of lines that actually became leads.
 * Whatever the cap turned away goes back in it, and the line underneath says
 * so in amber rather than reporting a clean success over the top of it.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

/** Stands in for the route: adds up to `limit` and counts out the rest. */
const capped = (limit: number) =>
  vi.fn(async (_url: string, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body ?? '{}')) as { lines: string[] };
    const taken = Math.min(sent.lines.length, limit);
    return {
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        count: taken,
        skipped: sent.lines.length - taken,
        limit,
      }),
    } as unknown as Response;
  });

let onCreated: ReturnType<typeof vi.fn>;

const openBulk = async (user: ReturnType<typeof userEvent.setup>) => {
  onCreated = vi.fn();
  render(<QuickAddLeadModal onClose={vi.fn()} onCreated={onCreated} />);
  await user.click(screen.getByRole('button', { name: 'Bulk Add' }));
  return screen.getByLabelText('Companies to add, one per line') as HTMLTextAreaElement;
};

const paste = async (
  user: ReturnType<typeof userEvent.setup>,
  box: HTMLTextAreaElement,
  lines: string[]
) => {
  box.focus();
  // A real paste, not 200 keystrokes — typing this list takes minutes of
  // fake timers and tests nothing extra.
  await user.paste(lines.join('\n'));
  await user.click(screen.getByRole('button', { name: 'Add All' }));
};

const companies = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => `Company ${from + i}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a paste that fits', () => {
  beforeEach(() => vi.stubGlobal('fetch', capped(200)));

  it('empties the box and says how many went in', async () => {
    const user = userEvent.setup();
    const box = await openBulk(user);

    await paste(user, box, ['Acme Roofing', 'Bell Joinery']);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added 2 companies.'));
    expect(box).toHaveValue('');
    /*
     * And it stays open. A bulk add used to close the modal, so this line —
     * the only statement of how many companies actually landed — was on
     * screen for one tick and read by nobody. There is nowhere to navigate
     * to after a paste, unlike the single-lead form which goes to the lead
     * it made.
     */
    expect(onCreated).toHaveBeenCalledWith(undefined, { keepOpen: true });
  });
});

describe('a paste bigger than the cap', () => {
  beforeEach(() => vi.stubGlobal('fetch', capped(200)));

  it('hands the leftovers back rather than clearing them', async () => {
    const user = userEvent.setup();
    const box = await openBulk(user);

    await paste(user, box, companies(250));

    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    /*
     * The exact fifty, in order. A box left holding the wrong fifty would be
     * worse than an empty one: it looks like the work is safe.
     */
    expect(box.value.split('\n')).toEqual(companies(50, 201));
  });

  /*
   * Found by driving a browser rather than by reasoning: the sales page
   * closes this modal whenever `onCreated` fires, so handing the leftovers
   * back into the textarea handed them into a component that unmounted in
   * the same tick. The box was "kept" and gone. It has to ask to stay.
   */
  it('asks to stay open, because the leftovers live in a textarea it owns', async () => {
    const user = userEvent.setup();
    const box = await openBulk(user);

    await paste(user, box, companies(250));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith(undefined, { keepOpen: true });
  });

  it('says the rest are still there, and does not call it a plain success', async () => {
    const user = userEvent.setup();
    const box = await openBulk(user);

    await paste(user, box, companies(250));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Added 200 companies');
    expect(status).toHaveTextContent('remaining 50 lines are still in the box');
    // Amber, not green: half a paste landed. The line under the box used to
    // be emerald whatever it said.
    expect(status.className).toContain('amber');
  });

  it('gets the rest in on a second press', async () => {
    const user = userEvent.setup();
    const box = await openBulk(user);

    await paste(user, box, companies(250));
    await waitFor(() => expect(box).toHaveValue(companies(50, 201).join('\n')));

    await user.click(screen.getByRole('button', { name: 'Add All' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Added 50 companies.'));
    expect(box, 'the second press finished the job, so now it may empty').toHaveValue('');
  });

  it('reads as one line when only one was turned away', async () => {
    vi.stubGlobal('fetch', capped(2));
    const user = userEvent.setup();
    const box = await openBulk(user);

    await paste(user, box, companies(3));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('remaining 1 line is still in the box');
    expect(status).toHaveTextContent('press Add All again to send it');
    expect(box).toHaveValue('Company 3');
  });
});

describe('a paste that was refused', () => {
  it('keeps every line and does not colour the refusal green', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: 'No valid company names found' }),
      }) as unknown as Response)
    );
    const user = userEvent.setup();
    const box = await openBulk(user);

    await paste(user, box, [',', ' , ']);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('No valid company names found');
    expect(status.className).toContain('red');
    expect(box.value).not.toBe('');
  });
});
