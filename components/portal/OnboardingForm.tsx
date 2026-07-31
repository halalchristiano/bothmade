'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Field, Section } from '@/lib/onboarding';

/**
 * The long form.
 *
 * Design decisions worth keeping if this gets edited:
 *
 *   - Every question shows its "why" without being asked. Disclosure widgets
 *     mean nobody reads them, and the reason a question is being asked is the
 *     thing that makes people answer it properly.
 *   - Progress is counted and shown, and required questions are counted
 *     separately, so someone can see they are eight answers from being able
 *     to submit rather than facing an indefinite wall.
 *   - Answers are held in local storage as they are typed. This form takes
 *     forty minutes; losing it to a closed tab would be unforgivable, and
 *     "we'll email you a link to come back" is a worse experience than just
 *     not losing it.
 *   - Nothing blocks on required fields until submit. Validating as you type
 *     shouts at people who are simply not finished yet.
 */

type Answers = Record<string, string | string[]>;

const STORAGE_PREFIX = 'bothmade:onboarding:';

export function OnboardingForm({
  sections,
  token,
  clientName,
}: {
  sections: Section[];
  token: string;
  clientName: string;
}) {
  // Keyed by token so two different projects on one machine never collide.
  const storageKey = useMemo(() => STORAGE_PREFIX + token.slice(0, 24), [token]);

  const [answers, setAnswers] = useState<Answers>({});

  /**
   * The saved draft is read after mount, never during render. Reading storage
   * in a `useState` initialiser desynchronises the server's HTML from the
   * client's first render — React throws away the whole tree and rebuilds it,
   * which on a form this size is a visible stutter and a genuine hydration
   * error in the console.
   */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setAnswers(JSON.parse(saved));
    } catch {
      // Corrupt or unreadable draft. Starting empty beats crashing the form.
    }
  }, [storageKey]);

  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [missing, setMissing] = useState<string[]>([]);

  const allFields = useMemo(() => sections.flatMap((s) => s.fields), [sections]);

  const isFilled = (f: Field) => {
    const v = answers[f.id];
    return Array.isArray(v) ? v.length > 0 : Boolean(v && v.trim());
  };

  const answered = allFields.filter(isFilled).length;
  const requiredFields = allFields.filter((f) => f.required);
  const requiredLeft = requiredFields.filter((f) => !isFilled(f)).length;
  const percent = Math.round((answered / Math.max(allFields.length, 1)) * 100);

  const update = (id: string, value: string | string[]) => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Private browsing, or a full quota. Losing the draft is bad; losing
        // the whole form to a thrown error would be worse.
      }
      return next;
    });
    // Clear a field from the missing list the moment it's filled.
    setMissing((prev) => prev.filter((m) => m !== id));
  };

  const submit = async () => {
    const stillMissing = requiredFields.filter((f) => !isFilled(f)).map((f) => f.id);

    if (stillMissing.length > 0) {
      setMissing(stillMissing);
      setError(
        `${stillMissing.length} required ${stillMissing.length === 1 ? 'question is' : 'questions are'} still blank — they're marked below.`
      );
      document.getElementById(`q-${stillMissing[0]}`)?.scrollIntoView({ block: 'center' });
      return;
    }

    setStatus('sending');
    setError('');

    try {
      const response = await fetch('/api/portal/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, answers }),
      });

      if (response.ok) {
        setStatus('sent');
        // Deliberately kept in local storage — a client who wants to check
        // what they said should still be able to.
      } else {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? 'Could not submit. Please try again.');
        setStatus('idle');
      }
    } catch {
      setError('Something went wrong. Your answers are saved — try again in a moment.');
      setStatus('idle');
    }
  };

  if (status === 'sent') {
    return (
      <div className="rounded-3xl border border-emerald-400/25 bg-emerald-400/[0.04] p-10 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-emerald-300">Received</p>
        <h3 className="mt-6 text-2xl font-semibold">Thanks, {clientName} — that&apos;s everything we need.</h3>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/50">
          A copy is in your inbox. We&apos;re reading it properly and will come back within two
          working days with anything that needs a conversation. If you want to change an
          answer, just reply to that email.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Progress. Two numbers, because "12 required left" and "40% done" answer
          different anxieties. */}
      <div className="sticky top-[68px] z-30 -mx-6 mb-12 border-y border-white/10 bg-[#05030a] px-6 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
            {answered} of {allFields.length} answered
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-sky-300/70">
            {requiredLeft === 0 ? 'Ready to send' : `${requiredLeft} required left`}
          </p>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-400"
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
          />
        </div>
      </div>

      <div className="space-y-20">
        {sections.map((section, si) => {
          const done = section.fields.filter(isFilled).length;

          return (
            <section key={section.id}>
              <div className="mb-10 border-b border-white/10 pb-8">
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-xs tabular-nums text-sky-300/50">
                    {String(si + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-2xl font-semibold tracking-tight">{section.title}</h3>
                  <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
                    {done}/{section.fields.length} · ~{section.minutes} min
                  </span>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/45">
                  {section.intro}
                </p>
              </div>

              <div className="space-y-10">
                {section.fields.map((field) => (
                  <Question
                    key={field.id}
                    field={field}
                    value={answers[field.id]}
                    missing={missing.includes(field.id)}
                    onChange={(v) => update(field.id, v)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-20 border-t border-white/10 pt-10">
        <div role="status" aria-live="polite" aria-atomic="true">
          {error && (
            <p className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/[0.06] px-5 py-4 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-xs leading-relaxed text-white/30">
            Your answers save automatically as you type — you can close this and come back.
            Nothing is sent until you press the button.
          </p>

          <button
            type="button"
            onClick={submit}
            disabled={status === 'sending'}
            aria-busy={status === 'sending'}
            className="w-full shrink-0 rounded-full bg-white px-10 py-4 text-sm font-medium text-black transition-all duration-300 hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40 sm:w-auto"
          >
            {status === 'sending' ? 'Sending…' : 'Send to Bothmade'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Question({
  field,
  value,
  missing,
  onChange,
}: {
  field: Field;
  value: string | string[] | undefined;
  missing: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const base =
    'w-full rounded-2xl border bg-white/[0.02] px-5 py-4 text-[15px] text-white placeholder-white/20 transition-colors duration-200 focus:outline-none focus:border-sky-400/70 ' +
    (missing ? 'border-red-400/50' : 'border-white/12');

  const text = typeof value === 'string' ? value : '';
  const list = Array.isArray(value) ? value : [];

  return (
    <div id={`q-${field.id}`} className="scroll-mt-32">
      <label htmlFor={field.id} className="block text-base font-medium leading-snug">
        {field.label}
        {field.required && (
          <span className="ml-2 align-middle font-mono text-[10px] uppercase tracking-[0.2em] text-sky-300/60">
            required
          </span>
        )}
      </label>

      {/* The reason, always visible. This is the part that makes the form
          get answered instead of abandoned. */}
      <p className="mt-2.5 max-w-2xl border-l-2 border-white/10 pl-4 text-[13px] leading-relaxed text-white/40">
        {field.why}
      </p>

      <div className="mt-4">
        {field.type === 'long' && (
          <textarea
            id={field.id}
            rows={4}
            value={text}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={`${base} resize-y leading-relaxed`}
          />
        )}

        {(field.type === 'short' || field.type === 'url' || field.type === 'date') && (
          <input
            id={field.id}
            type={field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : 'text'}
            value={text}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={`${base} ${field.type === 'date' ? 'max-w-xs [color-scheme:dark]' : ''}`}
          />
        )}

        {field.type === 'choice' && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {field.options?.map((option) => {
              const checked = text === option;
              return (
                <label
                  key={option}
                  className={`cursor-pointer rounded-xl border px-4 py-3 text-sm transition-all duration-200 ${
                    checked
                      ? 'border-sky-400/60 bg-sky-400/[0.07] text-white'
                      : 'border-white/12 text-white/60 hover:border-white/30'
                  }`}
                >
                  <input
                    type="radio"
                    name={field.id}
                    checked={checked}
                    onChange={() => onChange(option)}
                    className="sr-only"
                  />
                  {option}
                </label>
              );
            })}
          </div>
        )}

        {field.type === 'multi' && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {field.options?.map((option) => {
              const checked = list.includes(option);
              return (
                <label
                  key={option}
                  className={`cursor-pointer rounded-xl border px-4 py-3 text-sm transition-all duration-200 ${
                    checked
                      ? 'border-sky-400/60 bg-sky-400/[0.07] text-white'
                      : 'border-white/12 text-white/60 hover:border-white/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange(
                        checked ? list.filter((v) => v !== option) : [...list, option]
                      )
                    }
                    className="sr-only"
                  />
                  <span className="mr-2 text-sky-300">{checked ? '✓' : '＋'}</span>
                  {option}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {missing && (
        <p className="mt-3 text-xs text-red-300">
          We genuinely can&apos;t start without this one.
        </p>
      )}
    </div>
  );
}
