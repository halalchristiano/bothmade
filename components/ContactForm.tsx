'use client';

import { motion } from 'framer-motion';
import { useState, useRef, FormEvent } from 'react';
import { ENQUIRY_PROBLEMS } from '@/lib/contact-enquiry';
import type { PainPointKey } from '@/lib/leads';
import { track } from '@vercel/analytics';
import { COUNTRIES, DEFAULT_COUNTRY, countryByIso2 } from '@/lib/country-codes';
import { trackEvent } from '@/lib/analytics';
import {
  FIELD_ERRORS,
  FIELD_LIMITS,
  composePhone,
  isValidCompany,
  isValidEmail,
  isValidMessage,
  isValidName,
  isValidPhone,
  sanitizeNameInput,
  sanitizeNationalNumber,
} from '@/lib/validation';

/** The fields a visitor can get wrong, as opposed to the menus and the honeypot. */
type ValidatedField = 'name' | 'email' | 'phone' | 'company' | 'message';

interface FormState {
  name: string;
  email: string;
  /** ISO 3166-1 alpha-2 of whatever the dial-code dropdown is showing. */
  country: string;
  /** Just the national part. `phone` as sent is this joined to the dial code. */
  phone: string;
  company: string;
  message: string;
  service: string;
  budget: string;
  timeline: string;
  website: string;
}

/** The dial code currently selected, e.g. '+44'. */
function dialOf(data: FormState): string {
  return countryByIso2(data.country)?.dial ?? '+1';
}

/** What gets sent and stored: dial code and number as one dialable string. */
function fullPhone(data: FormState): string {
  return composePhone(dialOf(data), data.phone);
}

/**
 * Which values each field will accept. The same predicates run in
 * `/api/contact`, so nothing that passes here is rejected on arrival and
 * nothing that fails here would have been accepted anyway.
 *
 * Name, email and message have to be there and have to be usable. Company
 * and phone may be left blank — an enquiry without a number is still an
 * enquiry, and a form that refuses one is a lead we never hear from — but a
 * number that *is* typed has to be dialable, because a rep working the call
 * list only finds out otherwise on the call that fails.
 *
 * Phone is judged on the composed value, not the box on its own — "7700
 * 900123" is only long enough to dial once +44 is in front of it.
 */
const VALIDATORS: Record<ValidatedField, (value: string, data: FormState) => boolean> = {
  name: (value) => isValidName(value),
  email: (value) => isValidEmail(value),
  phone: (value, data) => {
    const composed = composePhone(dialOf(data), value);
    return !composed || isValidPhone(composed);
  },
  company: (value) => isValidCompany(value),
  message: (value) => isValidMessage(value),
};

/**
 * Keeps values that could never be right out of the field entirely, rather
 * than letting them be typed and complaining afterwards. Only where there is
 * an unambiguous answer: letters in a phone number, digits in a name.
 */
const SANITIZERS: Partial<Record<ValidatedField, (value: string) => string>> = {
  name: sanitizeNameInput,
  phone: sanitizeNationalNumber,
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-red-600">
      {message}
    </p>
  );
}

/**
 * Underline-styled select matching the form's text fields. appearance-none
 * erases the native chevron, so each select draws its own — without one it
 * reads as a text field, not a menu.
 */
function UnderlineSelect({
  name,
  ariaLabel,
  value,
  onChange,
  className,
  children,
}: {
  name: string;
  ariaLabel: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative block">
      <select
        name={name}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        className={`${className} cursor-pointer appearance-none pr-8 ${value === '' ? 'text-black/25' : ''}`}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 8"
        className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-2 text-black/40"
      >
        <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const EMPTY: FormState = {
  name: '',
  email: '',
  country: DEFAULT_COUNTRY,
  phone: '',
  company: '',
  message: '',
  service: 'web',
  budget: '', // optional — but the single best qualifier we can ask for
  timeline: '', // optional — separates "ready" from "someday"
  website: '', // honeypot — hidden from humans, irresistible to bots
};

export function ContactForm() {
  const [formData, setFormData] = useState<FormState>(EMPTY);
  /**
   * What is wrong with what they have today.
   *
   * Tick boxes rather than a paragraph, because these are the exact keys the
   * brief, the recommendation engine and the estimate all already read — so
   * an enquiry answered here arrives with the brief written instead of
   * landing as prose somebody has to re-type into the same boxes later.
   */
  const [problems, setProblems] = useState<PainPointKey[]>([]);
  const toggleProblem = (key: PainPointKey) =>
    setProblems((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ValidatedField, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const isValidated = (name: string): name is ValidatedField => name in VALIDATORS;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name } = e.target;
    const sanitize = isValidated(name) ? SANITIZERS[name] : undefined;
    const value = sanitize ? sanitize(e.target.value) : e.target.value;
    const next = { ...formData, [name]: value };

    setFormData(next);

    // Clear an error as soon as the value stops being wrong, but don't raise
    // one mid-keystroke — nobody has typed a valid email by character three.
    if (isValidated(name) && fieldErrors[name] && VALIDATORS[name](value, next)) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    // Changing country changes what counts as a valid number, so a complaint
    // about the number has to be re-judged against the new dial code.
    if (name === 'country' && fieldErrors.phone && VALIDATORS.phone(next.phone, next)) {
      setFieldErrors((prev) => ({ ...prev, phone: undefined }));
    }
  };

  /** Leaving a field is the moment the visitor is finished with it, so that's when it's judged. */
  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (!isValidated(name)) return;
    // An untouched optional field isn't a mistake; an empty required one is
    // left alone until submit so tabbing through doesn't light the form up.
    if (!value.trim() && !fieldErrors[name]) return;
    setFieldErrors((prev) => ({
      ...prev,
      [name]: VALIDATORS[name](value, formData) ? undefined : FIELD_ERRORS[name],
    }));
  };

  /** Every field at once, for submit. Returns the fields that failed. */
  const validateAll = () => {
    const found: Partial<Record<ValidatedField, string>> = {};
    for (const name of Object.keys(VALIDATORS) as ValidatedField[]) {
      if (!VALIDATORS[name](formData[name], formData)) found[name] = FIELD_ERRORS[name];
    }
    return found;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const found = validateAll();
    if (Object.keys(found).length > 0) {
      setFieldErrors(found);
      // Put the cursor on the first problem rather than making them hunt for
      // it — on a phone the offending field is often off-screen.
      const first = (Object.keys(VALIDATORS) as ValidatedField[]).find((name) => found[name]);
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    setLoading(true);
    setFieldErrors({});

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The country dropdown is a way of typing the dial code, not a field
        // of its own — what the route and the CRM want is one dialable
        // string, which is what every dashboard then renders and links.
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: fullPhone(formData),
          company: formData.company,
          message: formData.message,
          problems,
          service: formData.service,
          budget: formData.budget,
          timeline: formData.timeline,
          website: formData.website,
        }),
      });

      if (response.ok) {
        // The conversion, recorded where it actually happens. The form
        // confirms inline rather than redirecting to a thank-you page, so
        // there is no page view standing in for "an enquiry came in".
        track('contact_submitted', { service: formData.service });
        trackEvent('contact_submitted', { service: formData.service });
        setSubmitted(true);
        // Country survives the reset: someone writing in twice has not moved.
        setFormData({ ...EMPTY, country: formData.country });
        setTimeout(() => setSubmitted(false), 4000);
      } else {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? 'Failed to send message. Please try again.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Falls back rather than throws: `country` only ever comes from the list
  // below, but a blank flag beats a blank page if that ever stops being true.
  const selectedCountry = countryByIso2(formData.country) ?? COUNTRIES[0];

  // Bold, minimal form. Large fields, generous space, underlines only.
  // Dark ink on white, no softness.
  const field =
    'w-full bg-transparent border-0 border-b-2 border-black/20 rounded-none px-0 py-5 text-lg md:text-xl text-black placeholder-black/25 focus:outline-none focus:border-black/60 transition-colors duration-200';

  return (
    // noValidate: the fields still carry `required` and their real types for
    // assistive tech, but the checking is ours, so a visitor gets the same
    // wording the server would give them instead of a browser bubble.
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-2">
      {/* Honeypot. Hidden from sighted users and screen readers alike, and
          skipped by tab order — only a bot filling every field will trip it. */}
      <div aria-hidden="true" className="absolute w-px h-px -left-[9999px] overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={formData.website}
          onChange={handleChange}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-x-10">
        <div>
          <input
            type="text"
            name="name"
            aria-label="Your name"
            autoComplete="name"
            placeholder="Name"
            value={formData.name}
            onChange={handleChange}
            onBlur={handleBlur}
            required
            maxLength={FIELD_LIMITS.name}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
            className={field}
          />
          <FieldError id="contact-name-error" message={fieldErrors.name} />
        </div>
        <div>
          <input
            type="email"
            name="email"
            aria-label="Your email address"
            autoComplete="email"
            inputMode="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            onBlur={handleBlur}
            required
            maxLength={FIELD_LIMITS.email}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'contact-email-error' : undefined}
            className={field}
          />
          <FieldError id="contact-email-error" message={fieldErrors.email} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-x-10">
        <div>
          <input
            type="text"
            name="company"
            aria-label="Company (optional)"
            autoComplete="organization"
            placeholder="Company"
            value={formData.company}
            onChange={handleChange}
            onBlur={handleBlur}
            maxLength={FIELD_LIMITS.company}
            aria-invalid={Boolean(fieldErrors.company)}
            aria-describedby={fieldErrors.company ? 'contact-company-error' : undefined}
            className={field}
          />
          <FieldError id="contact-company-error" message={fieldErrors.company} />
        </div>
        <UnderlineSelect
          name="service"
          ariaLabel="What do you need built?"
          value={formData.service}
          onChange={handleChange}
          className={field}
        >
          <option value="web">Web</option>
          <option value="ios">iOS &amp; iPad</option>
          <option value="mac">macOS</option>
          <option value="visionpro">Vision Pro</option>
          <option value="full-stack">Everything</option>
          <option value="other">Something else</option>
        </UnderlineSelect>
      </div>

      {/* Qualification row. Both optional — a lead without a budget is still
          a lead — but answered they route the enquiry straight into the
          right conversation instead of a "so, what's your budget?" email. */}
      <div className="grid md:grid-cols-2 gap-x-10">
        <UnderlineSelect
          name="budget"
          ariaLabel="Rough budget (optional)"
          value={formData.budget}
          onChange={handleChange}
          className={field}
        >
          <option value="">Budget (optional)</option>
          <option value="under-3k">Under $3k</option>
          <option value="3k-10k">$3k – $10k</option>
          <option value="10k-25k">$10k – $25k</option>
          <option value="25k-plus">$25k+</option>
          <option value="unsure">Not sure yet</option>
        </UnderlineSelect>
        <UnderlineSelect
          name="timeline"
          ariaLabel="Timeline (optional)"
          value={formData.timeline}
          onChange={handleChange}
          className={field}
        >
          <option value="">Timeline (optional)</option>
          <option value="asap">As soon as possible</option>
          <option value="1-3-months">Within 1–3 months</option>
          <option value="flexible">Flexible</option>
          <option value="exploring">Just exploring</option>
        </UnderlineSelect>
      </div>

      <div>
        {/* Dial code and number share one underline so they read as the
            single field they are. */}
        <div className="flex items-center border-b-2 border-black/20 focus-within:border-black/60 transition-colors duration-200">
          {/* A real <select> — native keyboard handling, and the wheel
              picker on a phone — but its own closed-state text would be the
              whole "🇬🇧 +44 United Kingdom" option, which is far too wide to
              sit beside the number. So it's transparent on top of the
              compact label we draw ourselves. */}
          <span className="relative flex items-center shrink-0 py-5 pr-3">
            <select
              name="country"
              aria-label="Country dial code"
              value={formData.country}
              onChange={handleChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              {COUNTRIES.map((country) => (
                <option key={country.iso2} value={country.iso2}>
                  {country.flag} {country.dial} {country.name}
                </option>
              ))}
            </select>
            <span
              aria-hidden="true"
              className="flex items-center gap-2 text-lg md:text-xl text-black pointer-events-none"
            >
              <span>{selectedCountry.flag}</span>
              <span>{selectedCountry.dial}</span>
              <svg viewBox="0 0 12 8" className="w-3 h-2 text-black/40">
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
            aria-label="Phone (optional)"
            autoComplete="tel-national"
            inputMode="tel"
            placeholder="Phone (optional)"
            value={formData.phone}
            onChange={handleChange}
            onBlur={handleBlur}
            maxLength={FIELD_LIMITS.nationalNumber}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? 'contact-phone-error' : undefined}
            className="w-full min-w-0 bg-transparent border-0 rounded-none px-0 py-5 text-lg md:text-xl text-black placeholder-black/25 focus:outline-none"
          />
        </div>
        <FieldError id="contact-phone-error" message={fieldErrors.phone} />
      </div>

      {/* What is wrong with what they have today.
          Tick boxes rather than a paragraph: these are the exact keys the
          brief, the recommendation engine and the estimate read, so an
          enquiry answered here arrives already briefed. Optional — somebody
          who only wants to say hello should not be made to audit themselves
          first. */}
      <fieldset className="border-0 p-0 m-0">
        <legend className="block text-sm text-black/50 mb-4">
          What is not working right now? Tick anything that sounds like you.
        </legend>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {ENQUIRY_PROBLEMS.map((problem) => {
            const checked = problems.includes(problem.key);
            return (
              <label
                key={problem.key}
                className={`flex items-start gap-3 py-2.5 cursor-pointer group transition-colors ${
                  checked ? 'text-black' : 'text-black/60 hover:text-black/85'
                }`}
              >
                <input
                  type="checkbox"
                  name="problems"
                  value={problem.key}
                  checked={checked}
                  onChange={() => toggleProblem(problem.key)}
                  className="mt-1 h-4 w-4 shrink-0 accent-black cursor-pointer"
                />
                <span className="text-base leading-snug">{problem.ask}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <textarea
          name="message"
          aria-label="Anything else we should know?"
          placeholder="Anything else we should know? (optional)"
          value={formData.message}
          onChange={handleChange}
          onBlur={handleBlur}
          rows={3}
          maxLength={FIELD_LIMITS.message}
          aria-invalid={Boolean(fieldErrors.message)}
          aria-describedby={fieldErrors.message ? 'contact-message-error' : undefined}
          className={`${field} resize-none`}
        />
        <FieldError id="contact-message-error" message={fieldErrors.message} />
      </div>

      {/* Always mounted so assistive tech is already watching it when the
          result arrives — a live region added at the same time as its content
          is announced unreliably. */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {submitted && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-4"
          >
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-700">
              Message received — we&apos;ll reply within 24h
            </p>
            {/* The acknowledgement is a first message from a young domain, so
                some inboxes will filter it however clean the authentication
                is. Saying so costs a line and turns "they never replied" into
                a folder someone actually checks — and a message rescued from
                spam is a positive signal to the filter, which helps the next
                one land. */}
            <p className="mt-3 text-sm leading-relaxed text-black/50">
              We&apos;ve sent a confirmation to the address you gave.{' '}
              <span className="text-black/75">
                If it isn&apos;t there in a minute, please check your spam or promotions
                folder
              </span>{' '}
              — and marking it &ldquo;not spam&rdquo; means our reply reaches you properly.
            </p>
          </motion.div>
        )}

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-4 font-mono text-xs uppercase tracking-[0.3em] text-red-600"
          >
            {error}
          </motion.p>
        )}
      </div>

      <div className="pt-12">
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="w-full md:w-auto px-10 py-5 md:py-6 bg-black text-white font-medium text-base md:text-lg transition-all duration-300 hover:bg-black/85 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
        {/* Forms lose people; a plain address never does. */}
        <p className="mt-6 text-sm text-black/40">
          Prefer email?{' '}
          <a
            href="mailto:info@bothmade.studio"
            className="text-black/70 hover:text-black transition-colors border-b border-black/20 hover:border-black/60 pb-0.5"
          >
            info@bothmade.studio
          </a>
          {' '}— we reply within 24 hours either way.
        </p>
      </div>
    </form>
  );
}
