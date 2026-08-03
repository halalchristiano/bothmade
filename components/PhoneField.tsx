'use client';

import { COUNTRIES, countryByIso2 } from '@/lib/country-codes';
import { FIELD_LIMITS, sanitizeNationalNumber } from '@/lib/validation';

/**
 * Dial code and number as one control, for every public form that asks for a
 * phone number.
 *
 * It lives here rather than in one form because both doors write to the same
 * `Lead.phone` column, and the dashboards, the `tel:` links and
 * `leadLocalTime` all read that column expecting one shape. Two
 * implementations of this would mean two shapes.
 *
 * The two variants are only paint: the homepage form is underlines on white,
 * the pricing calculator is boxed fields on dark. Everything about what the
 * field accepts is the same in both.
 */

export type PhoneFieldVariant = 'underline' | 'boxed';

const WRAPPER: Record<PhoneFieldVariant, string> = {
  underline:
    'flex items-center border-b-2 border-black/20 focus-within:border-black/60 transition-colors duration-200',
  boxed:
    'flex items-center rounded-lg bg-white/5 border border-white/15 focus-within:ring-2 focus-within:ring-sky-400/60 transition-colors',
};

const CODE: Record<PhoneFieldVariant, string> = {
  underline: 'flex items-center gap-2 text-lg md:text-xl text-black pointer-events-none',
  boxed: 'flex items-center gap-2 text-white pointer-events-none',
};

const CHEVRON: Record<PhoneFieldVariant, string> = {
  underline: 'w-3 h-2 text-black/40',
  boxed: 'w-3 h-2 text-white/40',
};

const CODE_BOX: Record<PhoneFieldVariant, string> = {
  underline: 'relative flex items-center shrink-0 py-5 pr-3',
  boxed: 'relative flex items-center shrink-0 py-3 pl-4 pr-3',
};

const INPUT: Record<PhoneFieldVariant, string> = {
  underline:
    'w-full min-w-0 bg-transparent border-0 rounded-none px-0 py-5 text-lg md:text-xl text-black placeholder-black/25 focus:outline-none',
  boxed:
    'w-full min-w-0 bg-transparent border-0 rounded-none px-0 py-3 pr-4 text-white placeholder:text-white/30 focus:outline-none',
};

export function PhoneField({
  variant,
  country,
  phone,
  onCountryChange,
  onPhoneChange,
  onBlur,
  label = 'Phone (optional)',
  invalid = false,
  describedBy,
  required = false,
}: {
  variant: PhoneFieldVariant;
  country: string;
  /** The national part only — the dial code comes from the dropdown. */
  phone: string;
  onCountryChange: (iso2: string) => void;
  /** Already sanitized: letters and a stray `+` never reach this. */
  onPhoneChange: (national: string) => void;
  onBlur?: (value: string) => void;
  /** Doubles as the accessible name and the placeholder, so they agree. */
  label?: string;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
}) {
  // Falls back rather than throws: `country` only ever comes from the list
  // below, but a blank flag beats a blank page if that ever stops being true.
  const selected = countryByIso2(country) ?? COUNTRIES[0];

  return (
    <div className={WRAPPER[variant]}>
      {/* A real <select> — native keyboard handling, and the wheel picker on
          a phone — but its own closed-state text would be the whole
          "🇬🇧 +44 United Kingdom" option, which is far too wide to sit beside
          the number. So it's transparent on top of the compact label we draw
          ourselves. */}
      <span className={CODE_BOX[variant]}>
        <select
          name="country"
          aria-label="Country dial code"
          value={country}
          onChange={(e) => onCountryChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          {COUNTRIES.map((option) => (
            <option key={option.iso2} value={option.iso2}>
              {option.flag} {option.dial} {option.name}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className={CODE[variant]}>
          <span>{selected.flag}</span>
          <span>{selected.dial}</span>
          <svg viewBox="0 0 12 8" className={CHEVRON[variant]}>
            <path
              d="M1 1.5L6 6.5L11 1.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </span>
      <input
        type="tel"
        name="phone"
        aria-label={label}
        autoComplete="tel-national"
        inputMode="tel"
        placeholder={label}
        value={phone}
        onChange={(e) => onPhoneChange(sanitizeNationalNumber(e.target.value))}
        onBlur={(e) => onBlur?.(e.target.value)}
        required={required}
        maxLength={FIELD_LIMITS.nationalNumber}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={INPUT[variant]}
      />
    </div>
  );
}
