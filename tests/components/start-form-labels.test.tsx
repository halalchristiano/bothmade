import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import StartPage from '@/app/start/page';

/**
 * /start is the page an enquiry converts on, and three of its four fields had
 * a label that was not attached to anything.
 *
 * The markup looked right — a visible `<label>` sat directly above each input
 * — but with no `htmlFor` and no `id` on the input, and the input a sibling
 * rather than a child, the two were never associated. Nothing about that is
 * visible, which is why it survived on the most commercially important form
 * on the site while `credential-form-labels` and `quick-add-lead-labels`
 * already guarded the same thing elsewhere.
 *
 * What it cost:
 *
 *   - A screen reader announced "edit text, blank". The placeholder is not a
 *     substitute: support is inconsistent, and it is cleared the moment
 *     anything is typed, so it cannot be re-read to check which box you are
 *     in halfway through.
 *   - Voice control had no name to match, so "click Email Address" did
 *     nothing.
 *   - Clicking the label did not focus the field — a plain usability loss for
 *     everyone, not only assistive-technology users.
 *
 * The phone field immediately below already did it correctly with
 * `htmlFor="start-phone"`. These tests query the way an assistive technology
 * does, by accessible name, so an input that loses its association fails here
 * rather than looking fine.
 */

const FIELDS = ['Contact Name', 'Email Address', 'Company Name'] as const;

describe('every field on the enquiry form has a name', () => {
  it.each(FIELDS)('exposes "%s" by its accessible name', (name) => {
    render(<StartPage />);
    // getByLabelText resolves through htmlFor/id, aria-label and wrapping —
    // exactly the association that was missing. A placeholder does not satisfy it.
    expect(screen.getByLabelText(new RegExp(`^${name}`, 'i'))).toBeInTheDocument();
  });

  it('gives the optional phone field a name too', () => {
    // By ROLE and name, not getByLabelText. This assertion originally used
    // getByLabelText and passed while the field was in fact named
    // "7700 900123" — PhoneField set aria-label={placeholder}, which beats a
    // <label> in the accessible-name computation, and getByLabelText matches
    // the label[for] regardless. It reported a name no browser would use.
    // Role-based queries follow the real precedence. See
    // tests/components/phone-field-name.test.tsx.
    render(<StartPage />);
    expect(screen.getByRole('textbox', { name: 'Phone (optional)' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Country dial code' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '7700 900123' })).toBeNull();
  });

  it('does not lean on the placeholder to say what a field is', () => {
    // A placeholder is a hint, not a label: it vanishes on input and is
    // announced inconsistently. Each field must carry a real name as well.
    render(<StartPage />);
    for (const name of FIELDS) {
      const field = screen.getByLabelText(new RegExp(`^${name}`, 'i'));
      expect(field.getAttribute('placeholder')).not.toBe(name);
    }
  });
});

describe('clicking the label moves the cursor into the field', () => {
  it.each(FIELDS)('focuses the input behind "%s"', async (name) => {
    // The behaviour a sighted mouse user notices. It is what a working
    // htmlFor/id pair buys, and it was silently absent.
    const user = userEvent.setup();
    render(<StartPage />);

    const field = screen.getByLabelText(new RegExp(`^${name}`, 'i'));
    await user.click(screen.getByText(name));
    expect(field).toHaveFocus();
  });
});

describe('the fields are still wired to the form', () => {
  it.each(FIELDS)('accepts typing into "%s"', async (name) => {
    // Guards the fix itself: adding an id must not have detached the
    // controlled value/onChange pair.
    const user = userEvent.setup();
    render(<StartPage />);

    const field = screen.getByLabelText(new RegExp(`^${name}`, 'i'));
    await user.type(field, 'Ada');
    expect(field).toHaveValue('Ada');
  });

  it('keeps every id unique, so a label points at exactly one field', () => {
    const { container } = render(<StartPage />);
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size, `duplicate ids: ${ids.join(', ')}`).toBe(ids.length);
  });
});
