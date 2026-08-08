'use client';

import { useState } from 'react';
import { Check, ClipboardList, Plus, Send, Trash2, X } from 'lucide-react';
import { inputClass } from '@/components/admin/ui';
import {
  ONBOARDING_PRESETS,
  ONBOARDING_TYPES,
  onboardingProgress,
  onboardingType,
  parseAnswer,
  parseOptions,
  serializeOptions,
  type OnboardingType,
} from '@/lib/onboarding';

/**
 * Writing the onboarding form, and actually asking somebody to fill it in.
 *
 * The old version was a text box, a dropdown, and a field labelled "Options,
 * comma-separated" — a storage format handed to a person to type. Adding a
 * question then did nothing at all: no email, no notice, no way to chase. The
 * client found the form only by opening a tab they had no reason to open, and
 * "Awaiting answer" sat on the project forever.
 *
 * So: options are chips you type and press Enter on, the common questions are
 * one click each rather than a blank box, how far through they are is stated
 * rather than counted by eye, and there is a button that tells them.
 */

export interface OnboardingQuestionRow {
  id: string;
  question: string;
  type: string;
  options: string;
  response?: { answer: string } | null;
}

export function OnboardingBuilder({
  projectId,
  questions,
  onChanged,
}: {
  projectId: string;
  questions: OnboardingQuestionRow[];
  onChanged: () => void;
}) {
  const [text, setText] = useState('');
  const [type, setType] = useState<OnboardingType>('text');
  const [options, setOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  /** The question whose bin has been pressed once, awaiting a real answer. */
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  /**
   * Kept apart from `error`, which belongs to the form at the bottom of this
   * card. A failure to remove the second question in the list, reported six
   * inches below the button that adds a new one, is a message nobody reads.
   */
  const [removeError, setRemoveError] = useState('');

  const spec = onboardingType(type);
  const progress = onboardingProgress(questions);
  const unanswered = questions.filter((q) => !q.response).length;

  const addOption = () => {
    const value = optionDraft.trim();
    if (!value || options.includes(value)) return;
    setOptions((prev) => [...prev, value]);
    setOptionDraft('');
  };

  const post = async (body: { question: string; type: string; options: string }) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Could not add that.');
        return false;
      }
      onChanged();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!text.trim()) return;
    // A pick-one with no answers to pick from renders as an empty dropdown,
    // which is worse than no question at all.
    if (spec.needsOptions && options.length < 2) {
      setError('Add at least two answers for them to choose from.');
      return;
    }
    const ok = await post({ question: text.trim(), type, options: serializeOptions(options) });
    if (ok) {
      setText('');
      setOptions([]);
      setOptionDraft('');
    }
  };

  /**
   * Taking a question off the form, and the answer underneath it.
   *
   * OnboardingResponse cascades from the question, so this is the only
   * control in the onboarding flow that can destroy something a client
   * typed — and it was a bin icon, one click, no question asked, sitting
   * directly beside the answer it would delete. There is no undo and no
   * copy of that text anywhere else.
   *
   * It also reported nothing. `await fetch(...)` then `onChanged()`
   * regardless, so a failure redrew the list with the question still in it:
   * indistinguishable from the button doing nothing, which invites a second
   * press. A 404 is the one exception worth swallowing — it means the
   * question had already gone, which is what was wanted, so the refresh IS
   * the right answer.
   */
  const remove = async (questionId: string) => {
    setConfirmRemove(null);
    setRemoveError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/onboarding/${questionId}`, {
        method: 'DELETE',
      });
      // 404: somebody else already removed it. The list below is simply out
      // of date, and reloading it is the whole fix.
      if (!res.ok && res.status !== 404) {
        setRemoveError(
          'Could not remove that question — it is still on the form. Try again in a moment.'
        );
      }
    } catch {
      setRemoveError('Could not reach the server, so nothing was removed.');
    } finally {
      onChanged();
    }
  };

  const askThem = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/onboarding/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Could not send that.');
        return;
      }
      setNotice(
        data?.sent
          ? 'Asked. They have the link and they know the team is waiting.'
          : 'Recorded, but the email did not go out. Tell them yourself.'
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative rounded-2xl border border-white/[0.06] bg-surface p-6 shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardList size={17} className="text-sky-300" />
            Onboarding form
          </h2>
          <p className="mt-0.5 text-xs text-white/40">
            What you need from them before the work can start. They answer it on their dashboard.
          </p>
        </div>
        {/* The thing the old version was missing entirely: a way to tell them
            the form exists. A question nobody has been asked is not a
            question, and it sat as "awaiting answer" indefinitely. */}
        {questions.length > 0 && (
          <button
            type="button"
            onClick={askThem}
            disabled={busy || unanswered === 0}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send size={13} />
            {unanswered === 0 ? 'All answered' : busy ? 'Sending…' : 'Ask them to fill it in'}
          </button>
        )}
      </div>

      {questions.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-white/50">{progress.line}</span>
            <span className="text-white/30">
              {progress.answered}/{progress.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-purple-500 transition-[width] duration-500"
              style={{ width: `${progress.total ? (progress.answered / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="mb-4 space-y-2">
        {questions.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/35">
            Nothing asked yet. Start from the common ones below.
          </p>
        )}
        {questions.map((q) => {
          const answers = parseAnswer(q.response?.answer, q.type);
          const answered = answers.length > 0;
          return (
            <div
              key={q.id}
              className={`rounded-xl border p-3 ${
                answered ? 'border-emerald-400/25 bg-emerald-400/[0.05]' : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{q.question}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-white/30">
                    {onboardingType(q.type).label}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setRemoveError('');
                    setConfirmRemove(q.id);
                  }}
                  aria-label={`Remove the question “${q.question}”`}
                  className="shrink-0 rounded-lg p-1.5 text-white/30 transition-colors hover:bg-red-400/10 hover:text-red-300"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/*
                The step that was missing. Inline rather than a dialogue, so
                the answer it is about to destroy stays on screen while the
                question is asked — a modal would cover the one thing worth
                looking at.
              */}
              {confirmRemove === q.id && (
                <div
                  role="group"
                  aria-label="Confirm removing this question"
                  className="mt-2.5 rounded-lg border border-red-400/25 bg-red-400/[0.06] px-3 py-2.5"
                >
                  <p className="text-xs leading-relaxed text-red-200">
                    {answered
                      ? 'Remove this question? Their answer goes with it, and there is no copy of it anywhere else.'
                      : 'Remove this question from the form?'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => remove(q.id)}
                      className="inline-flex min-h-8 items-center rounded-md border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-200 transition-colors hover:bg-red-400/15"
                    >
                      {answered ? 'Remove it and the answer' : 'Remove it'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(null)}
                      className="inline-flex min-h-8 items-center rounded-md px-2.5 py-1 text-xs font-medium text-white/50 transition-colors hover:text-white/80"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              )}
              {answered ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {answers.map((a) => (
                    <span
                      key={a}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100"
                    >
                      <Check size={11} />
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-white/30">Waiting on them.</p>
              )}
            </div>
          );
        })}
      </div>

      {removeError && (
        <p role="alert" className="mb-3 text-xs leading-relaxed text-red-300">
          {removeError}
        </p>
      )}

      {notice && <p className="mb-3 text-xs text-emerald-300">{notice}</p>}

      {/* The common questions, one click each. A blank box asks whoever is
          here to invent an onboarding process from nothing every time, which
          is why in practice one question got written and the rest never did. */}
      <div className="border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => setShowPresets((v) => !v)}
          className="text-xs font-medium text-sky-300 transition-colors hover:text-sky-200"
        >
          {showPresets ? 'Hide the common ones' : 'Add one of the common ones →'}
        </button>
        {showPresets && (
          <div className="mt-3 space-y-3">
            {[...new Set(ONBOARDING_PRESETS.map((p) => p.group))].map((group) => (
              <div key={group}>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/30">{group}</p>
                <div className="space-y-1">
                  {ONBOARDING_PRESETS.filter((p) => p.group === group).map((preset) => {
                    const already = questions.some((q) => q.question === preset.question);
                    return (
                      <button
                        key={preset.question}
                        type="button"
                        disabled={already || busy}
                        onClick={() =>
                          post({
                            question: preset.question,
                            type: preset.type,
                            options: serializeOptions(preset.options ?? []),
                          })
                        }
                        className="flex w-full items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/[0.06] disabled:opacity-30"
                      >
                        {already ? (
                          <Check size={12} className="mt-0.5 shrink-0 text-emerald-300" />
                        ) : (
                          <Plus size={12} className="mt-0.5 shrink-0 text-white/30" />
                        )}
                        {preset.question}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2.5 border-t border-white/10 pt-4">
        <p className="text-[11px] uppercase tracking-wide text-white/30">Or write your own</p>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you need to know?"
          className={`${inputClass} text-sm`}
        />

        <div className="grid gap-1.5 sm:grid-cols-2">
          {ONBOARDING_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                type === option.value
                  ? 'border-sky-400/40 bg-sky-400/10'
                  : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
              }`}
            >
              <span className="block text-xs font-medium text-white/85">{option.label}</span>
              <span className="block text-[11px] text-white/35">{option.hint}</span>
            </button>
          ))}
        </div>

        {/* Chips, not commas. The old field asked for the storage format, so a
            client's answer could contain a comma and quietly become two. */}
        {spec.needsOptions && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-white/30">
              Answers they can pick from
            </p>
            {options.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {options.map((option) => (
                  <span
                    key={option}
                    className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/25 bg-sky-400/10 px-2 py-1 text-xs text-sky-100"
                  >
                    {option}
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((o) => o !== option))}
                      aria-label={`Remove ${option}`}
                      className="text-sky-200/60 transition-colors hover:text-white"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={optionDraft}
                onChange={(e) => setOptionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addOption();
                  }
                }}
                placeholder="Type an answer, press Enter"
                className={`${inputClass} text-sm`}
              />
              <button
                type="button"
                onClick={addOption}
                disabled={!optionDraft.trim()}
                className="shrink-0 rounded-lg border border-white/15 px-3 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:opacity-30"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={add}
          disabled={busy || !text.trim()}
          className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Adding…' : 'Add this question'}
        </button>
      </div>
    </div>
  );
}
