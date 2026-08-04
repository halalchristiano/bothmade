'use client';

import Link from 'next/link';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { buildDealTimeline, dealProgress, nextAction, type DealTimelineInput } from '@/lib/deal-timeline';

/**
 * The whole deal on one line: contacted → mockup → proposal → signed →
 * payment 1 → 2 → 3.
 *
 * Sits at the top of the lead page because it is the answer to the question
 * that gets asked of a deal more than any other, and because the last three
 * steps were previously unreachable from Sales at all — a lead that converts
 * leaves for Delivery and takes its money with it.
 *
 * The strip scrolls horizontally rather than wrapping. Seven steps in a
 * fixed order read as a journey; the same seven reflowed onto three lines
 * read as a list, and a list is what this is trying to replace.
 */
export function DealTimeline({
  lead,
  projectId,
  className = '',
}: {
  lead: DealTimelineInput;
  projectId?: string | null;
  className?: string;
}) {
  const steps = buildDealTimeline(lead);
  const progress = dealProgress(steps);
  const done = steps.filter((s) => s.state === 'done').length;

  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <p className="text-sm font-semibold text-white">{nextAction(steps)}</p>
        <p className="text-xs text-white/35">
          {done} of {steps.length} done
          {projectId && (
            <>
              {' · '}
              <Link href={`/admin/projects/${projectId}`} className="text-sky-300/80 hover:text-sky-300">
                open project
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-purple-500 transition-all duration-500"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <ol className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <li key={step.key} className="flex items-stretch shrink-0">
              <div
                className={`min-w-[9.5rem] rounded-xl border px-3 py-2.5 ${
                  step.state === 'done'
                    ? 'border-emerald-400/25 bg-emerald-400/[0.06]'
                    : step.state === 'current'
                      ? 'border-sky-400/40 bg-sky-400/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.01]'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                      step.state === 'done'
                        ? 'bg-emerald-400/25 text-emerald-300'
                        : step.state === 'current'
                          ? 'bg-sky-400 text-black'
                          : 'bg-white/[0.07] text-white/35'
                    }`}
                  >
                    {step.state === 'done' ? (
                      <Check size={10} strokeWidth={3} />
                    ) : step.state === 'blocked' ? (
                      <Lock size={9} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={`text-[13px] font-medium truncate ${
                      step.state === 'todo' || step.state === 'blocked' ? 'text-white/45' : 'text-white'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                <p className="text-[11px] text-white/35 truncate" title={step.detail}>
                  {step.detail}
                </p>
                {step.at && (
                  <p className="text-[10px] text-white/25 mt-0.5">
                    {new Date(step.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
              {!isLast && (
                <ChevronRight size={14} className="self-center mx-0.5 shrink-0 text-white/15" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
