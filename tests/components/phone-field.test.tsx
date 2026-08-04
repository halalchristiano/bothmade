import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PhoneField } from '@/components/PhoneField';

/**
 * The public contact form learned to ask which country a number is in; the
 * CRM never did, so numbers typed by the team went in bare. "07496815847"
 * is a perfectly good UK mobile and a completely undialable US one, and
 * nothing in the record said which was meant — which a rep discovers on the
 * call that fails, and leadLocalTime cannot guess at all.
 */

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PhoneField value={value} onChange={setValue} className="field" />
      <output data-testid="stored">{value}</output>
    </>
  );
}

const stored = () => screen.getByTestId('stored').textContent;
const number = () => screen.getByLabelText('Phone');
const country = () => screen.getByLabelText('Country dial code');

describe('what gets stored', () => {
  it('keeps the dial code and the number as one dialable string', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(country(), 'GB');
    await user.type(number(), '7700 900123');

    expect(stored()).toBe('+44 7700 900123');
  });

  it('stores nothing at all while the number is empty', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(country(), 'GB');

    // Not '+44'. A lead with an untouched phone field must not arrive
    // looking like it has a number somebody would try to dial.
    expect(stored()).toBe('');
  });

  it('re-codes the number when the country changes', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(number(), '5550000000');
    expect(stored()).toBe('+1 5550000000');

    await user.selectOptions(country(), 'IE');

    expect(stored()).toBe('+353 5550000000');
  });

  it('refuses letters, and a second + the dropdown already supplies', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(number(), '+44 555-CALL');

    expect(number()).toHaveValue('44 555-');
  });
});

describe('a number that was already on file', () => {
  it('splits a stored number back onto the right country', () => {
    render(<Harness initial="+44 7700 900123" />);

    expect(country()).toHaveValue('GB');
    expect(number()).toHaveValue('7700 900123');
  });

  it('picks the longest matching dial code, not the first that fits', () => {
    // +353 must not be read as +3 — the naive match is the bug this avoids.
    render(<Harness initial="+353 871234567" />);

    expect(country()).toHaveValue('IE');
    expect(number()).toHaveValue('871234567');
  });

  it('leaves a legacy bare number alone rather than inventing a country', () => {
    // Everything entered before this field existed has no code. Declaring it
    // American would be making up information nobody gave us — the digits
    // stay exactly as they were until a human picks a country.
    render(<Harness initial="07496815847" />);

    expect(number()).toHaveValue('07496815847');
  });
});

describe('warning about a number that will not dial', () => {
  it('says so once enough digits are in to judge', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // Eleven digits behind +1 that are not a valid NANP number.
    await user.type(number(), '1234567');

    expect(screen.getByText(/doesn't look dialable/i)).toBeInTheDocument();
  });

  it('stays quiet while somebody is still typing', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(number(), '123');

    expect(screen.queryByText(/doesn't look dialable/i)).not.toBeInTheDocument();
  });

  it('stays quiet for a number that is fine', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(country(), 'GB');
    await user.type(number(), '7700900123');

    expect(screen.queryByText(/doesn't look dialable/i)).not.toBeInTheDocument();
  });
});
