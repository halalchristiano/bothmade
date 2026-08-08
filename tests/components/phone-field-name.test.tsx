import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhoneField } from '@/components/PhoneField';

/**
 * The phone input was named after its own example number.
 *
 * `PhoneField` set `aria-label={placeholder}` unconditionally, and aria-label
 * beats an associated `<label>` in the accessible-name computation. So every
 * call site labelled the field correctly and every call site was overridden:
 * Chrome resolved the /start field's name to "7700 900123".
 *
 * A screen reader user tabbing in heard a phone number where the question
 * should be, and voice control had no "Phone" to match.
 *
 * These tests query by ROLE and name rather than with `getByLabelText`, and
 * the distinction is the whole point. `getByLabelText` matches a `label[for]`
 * whether or not an aria-label is overriding it, so it reports the name a
 * browser would *not* use — it passed happily throughout the bug. Role-based
 * queries use the real precedence order.
 */

function Labelled({ ariaLabel }: { ariaLabel?: string } = {}) {
  return (
    <div>
      <label htmlFor="p">Phone (optional)</label>
      <PhoneField id="p" value="" onChange={() => {}} className="" placeholder="7700 900123" ariaLabel={ariaLabel} />
    </div>
  );
}

describe('a phone field with a visible label', () => {
  it('is named by its label, not by its placeholder', () => {
    render(<Labelled />);
    expect(screen.getByRole('textbox', { name: 'Phone (optional)' })).toBeInTheDocument();
  });

  it('is not reachable under the placeholder text', () => {
    // The regression, stated as the thing that must never come back.
    render(<Labelled />);
    expect(screen.queryByRole('textbox', { name: '7700 900123' })).toBeNull();
  });

  it('still shows the placeholder as a hint', () => {
    // Removing the aria-label must not remove the example number from view.
    render(<Labelled />);
    expect(screen.getByRole('textbox', { name: 'Phone (optional)' })).toHaveAttribute(
      'placeholder',
      '7700 900123'
    );
  });

  it('leaves the country selector its own name', () => {
    render(<Labelled />);
    expect(screen.getByRole('combobox', { name: 'Country dial code' })).toBeInTheDocument();
  });
});

describe('a caller with no visible label', () => {
  it('can still name the field explicitly', () => {
    // The escape hatch, so the fix is not "unnamed field" for anyone who
    // genuinely has nowhere to put a label.
    render(
      <PhoneField value="" onChange={() => {}} className="" placeholder="7700 900123" ariaLabel="Mobile number" />
    );
    expect(screen.getByRole('textbox', { name: 'Mobile number' })).toBeInTheDocument();
  });

  it('does not fall back to the placeholder when nothing is given', () => {
    render(<PhoneField value="" onChange={() => {}} className="" placeholder="7700 900123" />);
    expect(screen.queryByRole('textbox', { name: '7700 900123' })).toBeNull();
  });
});
