import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickAddLeadModal } from '@/components/admin/QuickAddLeadModal';

/**
 * The form the sales screen adds companies with.
 *
 * Every text field carried its name in `placeholder` alone — the one place a
 * name cannot stay, because it is gone the moment there is a character in the
 * box. Fill four fields, glance back to check the third, and there is nothing
 * to read but the value, which is exactly when you want to know whether that
 * box was Email or Source. A placeholder is also not a label to a screen
 * reader, so the form announced five unnamed text boxes.
 *
 * The "Starting status" group in the same file has had a real <label> since
 * it was written. This is the rest of the form catching up.
 *
 * `getByLabelText` is the test: it resolves the same way assistive technology
 * does, so it passes only when the name is attached rather than hinted.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, lead: { id: 'lead_1' } }) }) as unknown as Response)
  );
});

const open = () => render(<QuickAddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />);

describe('the single-company form', () => {
  it('names every field', () => {
    open();

    for (const label of [/^Company/, 'Contact name', 'Email', 'Phone', 'Source']) {
      expect(screen.getByLabelText(label), `${label} must be labelled`).toBeTruthy();
    }
  });

  /** The bug, stated directly: the name has to survive a value being in the box. */
  it('keeps the name on screen once the field has something in it', async () => {
    const user = userEvent.setup();
    open();

    await user.type(screen.getByLabelText('Email'), 'jane@acme.test');

    expect(screen.getByLabelText('Email')).toHaveValue('jane@acme.test');
    expect(screen.getByText('Email')).toBeTruthy();
  });

  it('says which field is required rather than hiding a star in a placeholder', () => {
    open();
    expect(screen.getByLabelText(/Company \(required\)/)).toBeTruthy();
  });

  it('marks the email field as an email, so a phone keyboard is not offered for it', () => {
    open();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
  });
});

describe('the bulk form', () => {
  it('names the paste box', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('button', { name: 'Bulk Add' }));

    expect(screen.getByLabelText(/one per line/i)).toBeTruthy();
  });
});

describe('two of these on one page', () => {
  /**
   * `htmlFor` is global. Hard-coded ids would make the second form's label
   * point at the first form's input, so clicking it focuses the wrong box.
   */
  it('does not collide on ids', () => {
    const { container } = render(
      <div>
        <QuickAddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />
        <QuickAddLeadModal onClose={vi.fn()} onCreated={vi.fn()} />
      </div>
    );

    const ids = Array.from(container.querySelectorAll('input[id]')).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
