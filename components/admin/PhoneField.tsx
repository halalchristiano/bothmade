'use client';

import { useEffect, useRef, useState } from 'react';
import { COUNTRIES, DEFAULT_COUNTRY, countryByIso2 } from '@/lib/country-codes';
import { composePhone, isValidPhone, phoneDigits, sanitizeNationalNumber } from '@/lib/validation';

/**
 * A phone field that knows which country the number is in.
 *
 * The public contact form got this and the CRM did not, so numbers typed by
 * the team went in bare — "07496815847" is a perfectly good UK mobile and a
 * completely undialable US one, and nothing in the record says which was
 * meant. That matters twice over: a rep working the call list needs a number
 * they can dial as-is, and leadLocalTime needs a country to work out whether
 * it is a civil hour where the lead actually is.
 *
 * Stores and emits one string, dial code included, exactly as the public
 * form does — so a lead typed in by hand and a lead that came through the
 * website are the same shape by the time anything reads them.
 */
export function PhoneField({
  value,
  onChange,
  className,
  placeholder = 'Phone',
  id,
}: {
  /** The whole number, dial code included — '' when empty. */
  value: string;
  onChange: (next: string) => void;
  /** The host form's input styling, so this matches its neighbours. */
  className: string;
  placeholder?: string;
  id?: string;
}) {
  // The two controls hold their own state rather than being derived from the
  // stored string, and it matters in both directions.
  //
  // Deriving the country from the value meant an empty number could not hold
  // one: composePhone of a blank number is blank by design (so an untouched
  // field never arrives looking like a bare "+44"), so picking a country
  // before typing was immediately forgotten. And deriving the number meant
  // every keystroke round-tripped through trim(), which ate the trailing
  // space the moment you typed one — "7700 900123" came out "7700900123"
  // and the space could never be entered at all.
  const [{ iso2, national }, setParts] = useState(() => split(value));

  // Re-seed when the value changes from outside — a lead loading, a form
  // resetting — but not from our own emit, which would fight the typing.
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setParts(split(value));
  }, [value]);

  const country = countryByIso2(iso2) ?? COUNTRIES[0];
  const digits = phoneDigits(value);
  // Only complain about a number somebody actually finished typing. Seven
  // digits is the shortest thing dialable anywhere, so below that they are
  // still mid-entry.
  const looksWrong = digits.length >= 7 && !isValidPhone(value);

  const emit = (nextIso2: string, nextNational: string) => {
    setParts({ iso2: nextIso2, national: nextNational });
    const dial = countryByIso2(nextIso2)?.dial ?? '+1';
    const composed = composePhone(dial, nextNational);
    lastEmitted.current = composed;
    onChange(composed);
  };

  const setCountry = (nextIso2: string) => emit(nextIso2, national);
  const setNational = (raw: string) => emit(iso2, sanitizeNationalNumber(raw));

  return (
    <div>
      <div className={`${className} flex items-center gap-2 !px-0`}>
        {/* A real <select> keeps native keyboard handling, but its closed
            state would read "🇬🇧 +44 United Kingdom" — far too wide to sit
            beside the number. So it is transparent over the compact label. */}
        <span className="relative flex items-center shrink-0 pl-4">
          <select
            aria-label="Country dial code"
            value={iso2}
            onChange={(e) => setCountry(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso2} value={c.iso2} className="bg-[#0b0b12] text-white">
                {c.flag} {c.dial} {c.name}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="flex items-center gap-1.5 pointer-events-none">
            <span>{country.flag}</span>
            <span className="text-white/70 text-sm tabular-nums">{country.dial}</span>
            <svg viewBox="0 0 12 8" className="w-2.5 h-1.5 text-white/40">
              <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-label={placeholder}
          aria-invalid={looksWrong || undefined}
          placeholder={placeholder}
          value={national}
          onChange={(e) => setNational(e.target.value)}
          className="w-full min-w-0 bg-transparent border-0 pr-4 py-0 text-white placeholder:text-white/30 focus:outline-none"
        />
      </div>
      {looksWrong && (
        <p className="mt-1 text-xs text-amber-300/80">
          That doesn&apos;t look dialable for {country.name} — worth checking before it reaches the call list.
        </p>
      )}
    </div>
  );
}

/**
 * Best guess at which country a stored number belongs to.
 *
 * Longest dial code first, because +1 is a prefix of nothing but +44 would
 * otherwise be read as +4. A number with no leading + is left with whatever
 * the default is and its digits untouched — it predates this field, and
 * silently declaring it American would invent information nobody gave us.
 */
function split(value: string): { iso2: string; national: string } {
  const trimmed = value.trim();
  if (!trimmed.startsWith('+')) {
    return { iso2: DEFAULT_COUNTRY, national: trimmed };
  }

  const byLength = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  const match = byLength.find((c) => trimmed.startsWith(c.dial));
  if (!match) return { iso2: DEFAULT_COUNTRY, national: trimmed.replace(/^\+/, '') };

  return { iso2: match.iso2, national: trimmed.slice(match.dial.length).trim() };
}
