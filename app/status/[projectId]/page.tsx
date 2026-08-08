'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { GridBackdrop } from '@/components/ui';

interface PublicProject {
  name: string;
  company: string;
  statusStage: number;
  estimatedCompletionDate: string | null;
  /** The finished site. Null until there is something to point at. */
  liveUrl: string | null;
  updates: Array<{ id: string; title: string; description: string; createdAt: string }>;
}

const STATUS_STAGES = ['Discovery', 'Design', 'Build', 'Launch', 'Complete'];

export default function PublicStatusPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  // The capability token from the shared link — the project ID on its own
  // isn't enough to read this page any more. Read off window rather than
  // useSearchParams() so this page needs no Suspense boundary to prerender.
  const [shareToken, setShareToken] = useState<string | null>(null);

  useEffect(() => {
    setShareToken(new URLSearchParams(window.location.search).get('t') || '');
  }, []);

  const [project, setProject] = useState<PublicProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (shareToken === null) return;
    fetch(`/api/public/projects/${projectId}/status?t=${encodeURIComponent(shareToken)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProject(data.project);
        } else {
          setError(data.error || 'Failed to load project status');
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load project status'))
      .finally(() => setLoading(false));
  }, [projectId, shareToken]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-sky-400/80" />
        <span className="sr-only">Loading project status</span>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-4 text-white">
        <div className="relative max-w-md rounded-2xl border border-white/[0.06] bg-surface p-8 text-center shadow-e3 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent">
          <h1 className="mb-3 text-2xl font-semibold">Not found</h1>
          <p className="text-sm text-white/50">
            {error || "This status link doesn't exist or has expired."}
          </p>
        </div>
      </main>
    );
  }

  const stageIndex = Math.min(project.statusStage, 4);
  const currentStage = STATUS_STAGES[stageIndex];
  /*
   * How far along the rail the filled line runs.
   *
   * Not `(stageIndex + 1) / 5`, which is the right answer for a plain bar and
   * the wrong one here: the stops are centred in five equal columns, so stop
   * `i` sits at `(i + 0.5) / 5`. The old formula overshoots by half a column
   * every time, which on the last stage draws a line running past the final
   * dot and off the end.
   */
  const progressPct = ((stageIndex + 0.5) / STATUS_STAGES.length) * 100;

  /*
   * The one page a client looks at more than once, so it is the page the
   * studio is judged by between calls.
   *
   * It used to say the same thing three times — a percentage bar, a "3/5",
   * and a row of five boxes with the done ones filled in gradient — which is
   * how a status page ends up looking anxious. One rail, five stops, and the
   * stop you are on named underneath it answers all three at once.
   *
   * Glass panels became real surfaces here for the same reason as everywhere
   * else, and the blurred purple bloom over the header came down to a trace.
   * A client checking whether their site is on schedule is not looking for
   * atmosphere; a page that stays calm while it tells them is worth more than
   * one that looks impressive while it does.
   */
  const card =
    'relative rounded-2xl border border-white/[0.06] bg-surface shadow-e2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-gradient-to-r before:from-transparent before:via-white/[0.09] before:to-transparent';

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink text-white">
      <GridBackdrop className="opacity-20" />
      <div
        className="pointer-events-none absolute -top-48 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full opacity-[0.09] blur-[160px]"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.6), transparent 70%)' }}
      />

      <div className="relative mx-auto max-w-3xl px-6 py-16 md:py-24">
        <p className="mb-3 text-2xs font-medium uppercase tracking-[0.16em] text-white/35">
          {project.company} · Read-only status
        </p>
        <h1 className="mb-10 text-3xl font-semibold md:text-4xl">{project.name}</h1>

        <section className={`${card} mb-5 p-7 md:p-8`}>
          <div className="mb-1 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">{currentStage}</h2>
            <span data-numeric className="text-sm text-white/40">
              Stage {stageIndex + 1} of {STATUS_STAGES.length}
            </span>
          </div>
          <p className="mb-8 text-sm text-white/40">
            {stageIndex >= STATUS_STAGES.length - 1
              ? 'Everything is delivered.'
              : `Next up: ${STATUS_STAGES[stageIndex + 1]}.`}
          </p>

          {/* One rail, five stops. The filled length is the progress bar, the
              nodes are the checklist, and the labels are the legend — the
              three separate things this card used to draw. */}
          <div className="relative">
            <div className="absolute left-0 right-0 top-[7px] h-px bg-white/10" aria-hidden="true" />
            <div
              className="absolute left-0 top-[7px] h-px bg-sky-400/70 transition-[width] duration-500 ease-ui"
              style={{ width: `${progressPct}%` }}
              aria-hidden="true"
            />
            <ol className="relative grid grid-cols-5 gap-1">
              {STATUS_STAGES.map((stage, idx) => {
                const done = idx < stageIndex;
                const current = idx === stageIndex;
                return (
                  <li key={stage} className="flex min-w-0 flex-col items-center text-center">
                    <span
                      aria-hidden="true"
                      className={`mb-3 h-[15px] w-[15px] shrink-0 rounded-full border-2 transition-colors duration-300 ease-ui ${
                        current
                          ? 'border-sky-400 bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.15)]'
                          : done
                            ? 'border-sky-400/70 bg-sky-400/70'
                            : 'border-white/15 bg-ink'
                      }`}
                    />
                    <span
                      className={`text-2xs font-medium leading-tight md:text-xs ${
                        current ? 'text-white' : done ? 'text-white/55' : 'text-white/25'
                      }`}
                    >
                      {stage}
                    </span>
                    {current && <span className="sr-only">(current stage)</span>}
                  </li>
                );
              })}
            </ol>
          </div>

          {/*
            The delivery moment, on the page they have actually been watching.
            Once there is a site to look at, it outranks a target date that
            has by then been met — so it takes that slot rather than queueing
            below it.
          */}
          {project.liveUrl ? (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Your site is live.</p>
                <p className="mt-0.5 truncate text-sm text-white/40">{project.liveUrl}</p>
              </div>
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink shadow-e2 transition-[background-color,transform] duration-150 ease-ui hover:bg-white/90 active:translate-y-px"
              >
                Visit it
                <ArrowUpRight size={15} />
              </a>
            </div>
          ) : (
            project.estimatedCompletionDate && (
              <p className="mt-8 border-t border-white/[0.06] pt-5 text-sm text-white/40">
                Estimated target{' '}
                <span data-numeric className="font-medium text-white/75">
                  {new Date(project.estimatedCompletionDate).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </p>
            )
          )}
        </section>

        <section className={`${card} p-7 md:p-8`}>
          <h2 className="mb-6 text-lg font-semibold">Recent updates</h2>
          {project.updates.length === 0 ? (
            <p className="text-sm text-white/35">
              Nothing posted yet — this fills in as the work moves.
            </p>
          ) : (
            /* A timeline rather than stacked rows separated by rules. The
               updates are one thread in time, and a continuous line says that
               where a series of horizontal dividers says the opposite. */
            <ol className="relative space-y-7 before:absolute before:bottom-2 before:left-[3px] before:top-2 before:w-px before:bg-white/[0.08]">
              {project.updates.map((update) => (
                <li key={update.id} className="relative pl-7">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-[7px] h-[7px] w-[7px] rounded-full bg-white/25 ring-4 ring-[color:var(--color-surface)]"
                  />
                  <p className="text-sm font-semibold text-white">{update.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/50">{update.description}</p>
                  <p data-numeric className="mt-2 text-xs text-white/25">
                    {new Date(update.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <p className="mt-10 text-center text-xs text-white/20">
          Shared read-only view — no login required.
        </p>
      </div>
    </main>
  );
}
