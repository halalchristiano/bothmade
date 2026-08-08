import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NewProjectPage from '@/app/admin/projects/new/page';

/**
 * The form that onboards a paying client had seven labels attached to nothing.
 *
 * Same shape as the /start enquiry form, and worse in one respect: those fields
 * at least had placeholders, so a screen reader with placeholder fallback got
 * *something*. These have none. Every one was announced as "edit text, blank"
 * — seven times, on the screen where a client's name, email and price are
 * entered.
 *
 * The markup looked right: a visible <label> directly above each control. With
 * no htmlFor, no id, and the control a sibling rather than a child, the two were
 * never associated. Nothing about that is visible, which is why it outlived a
 * pass that fixed ten unnamed controls elsewhere in the admin and the identical
 * bug on /start.
 *
 * Queried by role and accessible name rather than getByLabelText, for the
 * reason learned on PhoneField: getByLabelText matches a label[for] even when
 * an aria-label is overriding it, so it can report a name no browser would use.
 */

const FIELDS = [
  ['textbox', 'Contact Name'],
  ['textbox', 'Company'],
  ['textbox', 'Email'],
  ['textbox', 'Phone (optional)'],
  ['combobox', 'Client Type'],
  ['combobox', 'Timeline'],
] as const;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/projects/new',
}));

describe('every control on the new-project form has a name', () => {
  it.each(FIELDS)('exposes the %s named "%s"', (role, name) => {
    render(<NewProjectPage />);
    expect(screen.getByRole(role, { name: new RegExp(`^${escapeRegExp(name)}`, 'i') })).toBeInTheDocument();
  });

  it('names the price override, whose label carries a computed suggestion', () => {
    // The label text interpolates the calculated total, so it is matched by
    // prefix rather than exactly — and it is the field where getting the
    // association wrong is most expensive, since it sets what a client is
    // charged.
    render(<NewProjectPage />);
    expect(screen.getByRole('spinbutton', { name: /override price/i })).toBeInTheDocument();
  });

  it('leaves nothing on the form unnamed', () => {
    // The property that actually matters, checked over the whole form rather
    // than field by field, so a control added later is covered.
    const { container } = render(<NewProjectPage />);

    const unnamed = [...container.querySelectorAll('input,select,textarea')]
      .filter((el) => (el as HTMLInputElement).type !== 'hidden')
      .filter((el) => {
        const id = el.getAttribute('id');
        return !(
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          el.closest('label') ||
          (id && container.querySelector(`label[for="${id}"]`))
        );
      })
      .map((el) => `${el.tagName.toLowerCase()}#${el.getAttribute('id') || '(no id)'}`);

    expect(unnamed, `unnamed controls: ${unnamed.join(', ')}`).toEqual([]);
  });
});

describe('clicking a label focuses its field', () => {
  it.each(FIELDS)('%s "%s"', async (role, name) => {
    // What a sighted mouse user notices, and what a working htmlFor/id pair
    // buys on top of the announcement.
    const user = userEvent.setup();
    render(<NewProjectPage />);

    const field = screen.getByRole(role, { name: new RegExp(`^${escapeRegExp(name)}`, 'i') });
    await user.click(screen.getByText(name));
    expect(field).toHaveFocus();
  });
});

describe('the fields still work', () => {
  it('accepts typing into the client details', async () => {
    // Guards the fix: adding ids must not have detached the controlled
    // value/onChange pairs.
    const user = userEvent.setup();
    render(<NewProjectPage />);

    const contact = screen.getByRole('textbox', { name: /^contact name/i });
    await user.type(contact, 'Dana');
    expect(contact).toHaveValue('Dana');
  });

  it('keeps every id unique, so each label points at exactly one control', () => {
    const { container } = render(<NewProjectPage />);
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size, `duplicate ids: ${ids.join(', ')}`).toBe(ids.length);
  });
});

/**
 * "Phone (optional)" contains regex metacharacters — unescaped, `^Phone
 * (optional)` matches "Phone optional" and finds nothing. Cheap to miss and
 * cheap to fix.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
