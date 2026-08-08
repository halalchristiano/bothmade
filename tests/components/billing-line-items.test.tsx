import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillingPage from '@/app/admin/billing/page';

/**
 * The invoice composer, on a phone.
 *
 * Two controls on the form that bills a client were text-sized rather than
 * finger-sized. "+ Add line" was a 56x18 text link — the only way to put a
 * second item on an invoice. The row's remove "×" was about 24x16 inside
 * `px-1`, sitting immediately beside the amount field, which made the easiest
 * thing to hit by accident the one that deletes a line.
 *
 * Both keep their words and their icon; what changed is the box around them.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/billing',
}));

const TAP = 44;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/api/auth/me')) {
        return { ok: true, status: 200, json: async () => ({ user: { id: 'u1', role: 'owner' } }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ success: true, projects: [], invoices: [], clients: [] }) } as unknown as Response;
    })
  );
});

const ready = async () => {
  render(<BillingPage />);
  await waitFor(() => expect(screen.getByRole('button', { name: /add line/i })).toBeTruthy());
};

/** Tailwind sizes are classes here, so that is what gets asserted. */
const sized = (el: HTMLElement) => el.className;

describe('adding a line to an invoice', () => {
  it('offers a control big enough to press', async () => {
    await ready();

    const add = screen.getByRole('button', { name: /add line/i });
    // min-h-11 is 44px — the smallest target that reliably takes a tap.
    expect(sized(add)).toMatch(/min-h-11/);
    expect(sized(add)).toMatch(/px-3/);
  });

  it('actually adds one', async () => {
    const user = userEvent.setup();
    await ready();

    const before = screen.getAllByPlaceholderText('Description').length;
    await user.click(screen.getByRole('button', { name: /add line/i }));

    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(before + 1);
  });
});

describe('removing a line', () => {
  it('appears only once there is more than one line to remove', async () => {
    const user = userEvent.setup();
    await ready();

    // A single line has nothing to remove, so no button at all.
    expect(screen.queryByRole('button', { name: /remove line/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /add line/i }));
    expect(screen.getAllByRole('button', { name: /remove line/i })).toHaveLength(2);
  });

  it('gives each one a thumb-sized target and a name that says which line', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole('button', { name: /add line/i }));

    const first = screen.getByRole('button', { name: /remove line 1/i });
    expect(sized(first)).toMatch(/\bh-11\b/);
    expect(sized(first)).toMatch(/\bw-11\b/);
  });

  it('removes the line it names', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole('button', { name: /add line/i }));

    const [firstDescription] = screen.getAllByPlaceholderText('Description');
    await user.type(firstDescription, 'Design round');

    await user.click(screen.getByRole('button', { name: /remove line 2/i }));

    const left = screen.getAllByPlaceholderText('Description') as HTMLInputElement[];
    expect(left).toHaveLength(1);
    expect(left[0].value).toBe('Design round');
  });
});

describe('the tap target these are measured against', () => {
  it('is 44px, which is what h-11 and min-h-11 mean', () => {
    // Written down so the numbers in the assertions above have a reason.
    expect(TAP).toBe(44);
  });
});
