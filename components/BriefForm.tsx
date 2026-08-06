'use client';

import { useState } from 'react';
import { ENQUIRY_PROBLEMS } from '@/lib/contact-enquiry';
import { BRIEF_QUESTIONS, WANTED_CAPABILITIES, type BriefAnswerKey } from '@/lib/client-brief-form';
import type { PainPointKey } from '@/lib/leads';

/**
 * The questions we send a client after they enquire.
 *
 * Tick boxes and radio buttons almost all the way down, on purpose. A picked
 * option lands straight in the lead column the brief, the CSV export and the
 * pricing already read; a paragraph has to be read and re-typed into those
 * same boxes by somebody first. The one text box at the end is for the thing
 * no list anticipated.
 *
 * Prefilled with whatever they already told us on the website form, because
 * being asked the same question twice by the same company is how a form gets
 * closed. Nothing here is required — a partly answered form is worth more
 * than an abandoned one.
 */
export function BriefForm({
  token,
  company,
  contactName,
  initialProblems,
}: {
  token: string;
  company: string | null;
  contactName: string | null;
  initialProblems: PainPointKey[];
}) {
  const [problems, setProblems] = useState<PainPointKey[]>(initialProblems);
  const [answers, setAnswers] = useState<Partial<Record<BriefAnswerKey, string>>>({});
  /** What the new site has to let people do — the other half of the problems. */
  const [wants, setWants] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const toggleProblem = (key: PainPointKey) =>
    setProblems((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const toggleWant = (key: string) =>
    setWants((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const answered =
    problems.length > 0 ||
    wants.length > 0 ||
    Object.keys(answers).length > 0 ||
    extra.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answered) {
      setError('Answer at least one thing and we will take it from there.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/public/brief/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problems, wants, answers, extra }),
      });
      if (res.ok) setSent(true);
      else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'That did not send. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-8">
        <h2 className="text-xl font-semibold mb-2">That is everything we needed — thank you.</h2>
        <p className="text-white/60 leading-relaxed">
          A member of the sales team is reading it now and will come back to you with what we
          would do about it. You will not hear from us again in the meantime.
        </p>
      </div>
    );
  }

  return (
    // flex + gap rather than space-y: the questions are long lists of small
    // rows, and without a clear break between them one group's last option
    // reads as the next group's first.
    <form onSubmit={submit} className="flex flex-col gap-12">
      {/* What is wrong. The same tick boxes as the website form, pre-ticked
          from what they already said, so this is a chance to add to it rather
          than a repeat of it. */}
      <fieldset className="border-0 p-0 m-0">
        <legend className="text-lg font-semibold mb-1">
          What is not working right now?
        </legend>
        <p className="text-sm text-white/40 mb-5">
          Tick anything that sounds like you. Most businesses tick several.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6">
          {ENQUIRY_PROBLEMS.map((problem) => {
            const checked = problems.includes(problem.key);
            return (
              <label
                key={problem.key}
                className={`flex items-start gap-3 py-2.5 cursor-pointer transition-colors ${
                  checked ? 'text-white' : 'text-white/55 hover:text-white/80'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleProblem(problem.key)}
                  className="mt-1 h-4 w-4 shrink-0 accent-sky-400 cursor-pointer"
                />
                <span className="leading-snug">{problem.ask}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* What "fixed" looks like. The problems above say what hurts; this
          says what the thing has to do instead, which is a different
          question and the one that decides what gets built. */}
      <fieldset className="border-0 p-0 m-0">
        <legend className="text-lg font-semibold mb-1">
          What should the new one let people do?
        </legend>
        <p className="text-sm text-white/40 mb-5">Tick everything that matters. Most people tick a few.</p>
        <div className="grid sm:grid-cols-2 gap-x-6">
          {WANTED_CAPABILITIES.map((item) => {
            const checked = wants.includes(item.key);
            return (
              <label
                key={item.key}
                className={`flex items-start gap-3 py-2.5 cursor-pointer transition-colors ${
                  checked ? 'text-white' : 'text-white/55 hover:text-white/80'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleWant(item.key)}
                  className="mt-1 h-4 w-4 shrink-0 accent-sky-400 cursor-pointer"
                />
                <span className="leading-snug">{item.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {BRIEF_QUESTIONS.map((question) => (
        <fieldset key={question.key} className="border-0 p-0 m-0">
          <legend className="text-lg font-semibold mb-1">{question.question}</legend>
          {question.hint && <p className="text-sm text-white/40 mb-5">{question.hint}</p>}
          <div className={question.hint ? '' : 'mt-4'}>
            {question.options.map((option) => {
              const checked = answers[question.key] === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 py-2.5 cursor-pointer transition-colors ${
                    checked ? 'text-white' : 'text-white/55 hover:text-white/80'
                  }`}
                >
                  <input
                    type="radio"
                    name={question.key}
                    value={option.value}
                    checked={checked}
                    onChange={() =>
                      setAnswers((prev) => ({ ...prev, [question.key]: option.value }))
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-sky-400 cursor-pointer"
                  />
                  <span className="leading-snug">{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div>
        <label className="block text-lg font-semibold mb-1" htmlFor="brief-extra">
          Anything else we should know?
        </label>
        <p className="text-sm text-white/40 mb-4">
          Something the boxes above did not cover, a deadline, a competitor whose site you like.
        </p>
        <textarea
          id="brief-extra"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="Optional"
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-sky-400/60 focus:bg-white/[0.05] resize-y"
        />
      </div>

      <div>
        {/* Always mounted, so assistive tech is already watching it when a
            failure arrives — a live region added at the same moment as its
            content is announced unreliably. */}
        <div role="status" aria-live="polite">
          {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        </div>
        <button
          type="submit"
          disabled={sending}
          aria-busy={sending}
          className="w-full sm:w-auto rounded-full bg-gradient-to-r from-sky-400 to-purple-500 px-10 py-4 text-base font-semibold text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {sending ? 'Sending…' : 'Send this to the team'}
        </button>
        <p className="mt-5 text-sm text-white/35">
          {company ? `Answers are attached to ${company}. ` : ''}
          Nothing here commits you to anything, and there are no prices on this form — what
          something costs depends on these answers, so we would rather talk about it than guess
          at you.
        </p>
        {contactName && (
          <p className="sr-only">Filled in on behalf of {contactName}.</p>
        )}
      </div>
    </form>
  );
}
