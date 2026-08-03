import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PhoneField, type PhoneFieldVariant } from '@/components/PhoneField';
import { composePhone } from '@/lib/validation';
import { countryByIso2 } from '@/lib/country-codes';

/**
 * One control, two forms. The homepage form and the pricing calculator write
 * to the same `Lead.phone` column, and the dashboards, the `tel:` links and
 * `leadLocalTime` all read that column expecting one shape — so what matters
 * here is that both variants behave identically, and that only the paint
 * differs.
 */

/** Minimal host, so the assertions are about the field and not a whole form. */
function Host({ variant = 'underline' as PhoneFieldVariant }) {
  const [country, setCountry] = useState('US');
  const [phone, setPhone] = useState('');
  return (
    <>
      <PhoneField
        variant={variant}
        country={country}
        phone={phone}
        onCountryChange={setCountry}
        onPhoneChange={setPhone}
      />
      <output data-testid="composed">
        {composePhone(countryByIso2(country)?.dial ?? '+1', phone)}
      </output>
    </>
  );
}

const phone = () => screen.getByLabelText('Phone (optional)');
const country = () => screen.getByLabelText('Country dial code');
const composed = () => screen.getByTestId('composed').textContent;

describe.each(['underline', 'boxed'] as PhoneFieldVariant[])('the %s variant', (variant) => {
  it('offers every country with its flag, code and name', () => {
    render(<Host variant={variant} />);

    expect(within(country()).getByRole('option', { name: '🇬🇧 +44 United Kingdom' })).toBeInTheDocument();
    expect(within(country()).getByRole('option', { name: '🇺🇸 +1 United States' })).toBeInTheDocument();
  });

  it('will not accept letters in the number', async () => {
    const user = userEvent.setup();
    render(<Host variant={variant} />);

    await user.type(phone(), '555-CALL');

    expect(phone()).toHaveValue('555-');
  });

  it('refuses a + in the number box, since the dropdown supplies it', async () => {
    const user = userEvent.setup();
    render(<Host variant={variant} />);

    await user.type(phone(), '+445550000');

    expect(phone()).toHaveValue('445550000');
  });

  it('composes the chosen code in front of the number', async () => {
    const user = userEvent.setup();
    render(<Host variant={variant} />);

    await user.selectOptions(country(), 'GB');
    await user.type(phone(), '7700 900123');

    expect(composed()).toBe('+44 7700 900123');
  });

  it('composes nothing at all from an untouched field', () => {
    // Not '+1'. A bare dial code in the CRM reads as a phone number right up
    // until someone tries to ring it.
    render(<Host variant={variant} />);

    expect(composed()).toBe('');
  });
});

describe('what the two variants do not share', () => {
  it('paints differently, so each form keeps its own look', () => {
    const { container: underline } = render(<Host variant="underline" />);
    const underlineInput = underline.querySelector('input[name="phone"]')!;

    const { container: boxed } = render(<Host variant="boxed" />);
    const boxedInput = boxed.querySelector('input[name="phone"]')!;

    expect(underlineInput.className).toContain('text-black');
    expect(boxedInput.className).toContain('text-white');
  });
});

describe('optional extras the forms opt into', () => {
  it('reports the value on blur, so a form can judge it then', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    render(
      <PhoneField
        variant="underline"
        country="US"
        phone="5550000000"
        onCountryChange={() => {}}
        onPhoneChange={() => {}}
        onBlur={onBlur}
      />
    );

    await user.click(phone());
    await user.tab();

    expect(onBlur).toHaveBeenCalledWith('5550000000');
  });

  it('can be made required and relabelled, without changing what it accepts', () => {
    render(
      <PhoneField
        variant="underline"
        country="US"
        phone=""
        label="Your phone number"
        required
        onCountryChange={() => {}}
        onPhoneChange={() => {}}
      />
    );

    const input = screen.getByLabelText('Your phone number');
    expect(input).toBeRequired();
    // Label and placeholder come from one value, so they cannot disagree.
    expect(input).toHaveAttribute('placeholder', 'Your phone number');
  });
});
