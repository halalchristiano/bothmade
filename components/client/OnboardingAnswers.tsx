'use client';

import { useState } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import {
  onboardingProgress,
  parseAnswer,
  parseOptions,
  serializeAnswer,
} from '@/lib/onboarding';

/**
 * The client's side of the onboarding form.
 *
 * The old one was a stack of bare inputs, each with its own Save Answer
 * button underneath it — so answering five questions meant five saves, with
 * nothing saying how many were left or what happened when you finished. A
 * "pick one" question rendered as a dropdown, which hides the options behind
 * a tap and makes a three-answer question feel like a form field.
 *
 * This says where they are, shows the choices as choices, saves as they go,
 * and tells them when they are done. Nothing is required and nothing is lost:
 * a half-answered form is worth considerably more than an abandoned one.
 */

export interface ClientQuestion {
  id: string;
  question: string;
  type: string;
  options: string;
  response: { answer: string } | null;
}

export function OnboardingAnswers({
  projectId,
  questions,
  onSaved,
}: {
  projectId: string;
  questions: ClientQuestion[];
  onSaved: () => void;
}) {
  // Seeded from what they have already answered, so returning to the tab
  // shows their answers rather than an empty form over the top of them.
  const [draft, setDraft] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, parseAnswer(q.response?.answer, q.type)]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const progress = onboardingProgress(questions);

  const save = async (q: ClientQuestion, values: string[]) => {
    setSaving(q.id);
    try {
      await fetch(`/api/projects/${projectId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.id, answer: serializeAnswer(values, q.type) }),
      });
      setJustSaved(q.id);
      setTimeout(() => setJustSaved((id) => (id === q.id ? null : id)), 2000);
      onSaved();
    } finally {
      setSaving(null);
    }
  };

  /** A choice saves the moment it is made — there is nothing further to type. */
  const pick = (q: ClientQuestion, value: string) => {
    const current = draft[q.id] ?? [];
    const next =
      q.type === 'multi'
        ? current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value]
        : [value];
    setDraft((prev) => ({ ...prev, [q.id]: next }));
    save(q, next);
  };

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
        <h2 className="mb-2 text-xl font-bold">Onboarding</h2>
        <p className="text-white/50">
          Nothing to fill in yet. If we need something from you, it will appear here and we will
          email you about it.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
      <h2 className="mb-1 text-xl font-bold">
        {progress.done ? 'Thank you — that is everything' : 'A few things we need from you'}
      </h2>
      <p className="mb-5 text-sm text-white/50">
        {progress.done
          ? 'All answered. Nothing else is waiting on you — we will come back to you when there is something to see.'
          : 'These are the things we cannot start without. Most take a sentence, and your answers save as you go.'}
      </p>

      {/* Where they are. Five bare inputs with no sense of an ending is how a
          form gets abandoned three questions in. */}
      <div className="mb-7">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className={progress.done ? 'text-emerald-300' : 'text-white/50'}>{progress.line}</span>
          <span className="text-white/30">
            {progress.answered}/{progress.total}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              progress.done ? 'bg-emerald-400' : 'bg-gradient-to-r from-sky-400 to-purple-500'
            }`}
            style={{ width: `${(progress.answered / progress.total) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-7">
        {questions.map((q, index) => {
          const options = parseOptions(q.options, q.type);
          const values = draft[q.id] ?? [];
          const answered = Boolean(q.response);
          const choice = q.type === 'select' || q.type === 'multi' || q.type === 'yesno';

          return (
            <div key={q.id}>
              <div className="mb-2.5 flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    answered ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/[0.07] text-white/40'
                  }`}
                >
                  {answered ? <Check size={11} /> : index + 1}
                </span>
                <label className="text-[15px] font-medium leading-snug text-white/90">
                  {q.question}
                </label>
              </div>

              <div className="pl-8">
                {choice ? (
                  <div className="flex flex-wrap gap-2">
                    {options.map((option) => {
                      const on = values.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => pick(q, option)}
                          disabled={saving === q.id}
                          className={`rounded-xl border px-4 py-2.5 text-sm transition-colors disabled:opacity-60 ${
                            on
                              ? 'border-sky-400/60 bg-sky-400/15 text-white'
                              : 'border-white/12 bg-white/[0.03] text-white/70 hover:border-white/25 hover:bg-white/[0.07]'
                          }`}
                        >
                          {on && <Check size={12} className="mr-1.5 inline align-[-1px]" />}
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    {q.type === 'textarea' ? (
                      <textarea
                        value={values[0] ?? ''}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [q.id]: [e.target.value] }))}
                        onBlur={() => values[0]?.trim() && save(q, values)}
                        rows={3}
                        placeholder="However much or little you like"
                        className="w-full resize-none rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-white placeholder:text-white/25 transition-colors focus:border-sky-400/60 focus:bg-white/[0.05] focus:outline-none"
                      />
                    ) : (
                      <input
                        value={values[0] ?? ''}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [q.id]: [e.target.value] }))}
                        onBlur={() => values[0]?.trim() && save(q, values)}
                        placeholder="Your answer"
                        className="w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-white placeholder:text-white/25 transition-colors focus:border-sky-400/60 focus:bg-white/[0.05] focus:outline-none"
                      />
                    )}
                    {/* Saved on leaving the field, so there is no button to
                        forget. Said out loud, because a save nobody can see
                        is a save nobody trusts. */}
                    <p className="mt-1.5 h-4 text-xs">
                      {saving === q.id ? (
                        <span className="text-white/35">Saving…</span>
                      ) : justSaved === q.id ? (
                        <span className="text-emerald-300">Saved</span>
                      ) : answered ? (
                        <span className="text-white/25">Saved — edit it any time</span>
                      ) : null}
                    </p>
                  </>
                )}
                {q.type === 'multi' && (
                  <p className="mt-2 text-xs text-white/30">Pick as many as apply.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {progress.done && (
        <div className="mt-7 flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-4">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-300" />
          <p className="text-sm text-white/70">
            That is everything we needed. You can change any answer above if something turns out
            differently — we read it either way.
          </p>
        </div>
      )}
    </div>
  );
}
