'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, MessageSquareQuote, Sparkles } from 'lucide-react';
import { FEEDBACK_KINDS, revisionState, type FeedbackKind } from '@/lib/design-feedback';

/**
 * What the client said, sorted the way the agreement prices it.
 *
 * The three groups want three different responses, and reading them as one
 * list is how a studio ends up doing paid work for free — or, worse, billing
 * a client for its own mistake:
 *
 *   Not as agreed  → we got it wrong. Fix free, costs them no round (Exhibit C).
 *   In-scope change → the work you owe them, out of the two included rounds.
 *   New scope      → not a revision at all. Section 9. Your call.
 *
 * The new-scope group is the one worth looking at hardest, so it is coloured
 * and captioned rather than left as another bullet. The client has NOT been
 * told it might be chargeable — that is a judgement about the relationship,
 * and this panel is where a person makes it.
 */

interface FeedbackItem {
  area: string;
  kind: FeedbackKind;
  detail: string;
}

interface FeedbackRound {
  id: string;
  round: number;
  items: FeedbackItem[];
  liked: string | null;
  note: string | null;
  consumedRound: boolean;
  reviewedAt: string | null;
  createdAt: string;
}

const GROUPS: Array<{
  kind: FeedbackKind;
  tone: string;
  caption: string;
  icon: typeof AlertTriangle;
}> = [
  {
    kind: 'not-as-agreed',
    tone: 'border-amber-400/25 bg-amber-400/[0.05] text-amber-200',
    caption: 'We got this wrong. Fix at no charge — and it does not come out of their two rounds.',
    icon: AlertTriangle,
  },
  {
    kind: 'change',
    tone: 'border-sky-400/25 bg-sky-400/[0.05] text-sky-200',
    caption: 'Within scope. This is the work the included revision rounds are for.',
    icon: MessageSquareQuote,
  },
  {
    kind: 'new',
    tone: 'border-rose-400/30 bg-rose-400/[0.06] text-rose-200',
    caption:
      'Not a revision — Section 9. Absorb it or quote it, your call. They have not been told either way.',
    icon: Sparkles,
  },
];

export function DesignFeedbackPanel({ projectId }: { projectId: string }) {
  const [rounds, setRounds] = useState<FeedbackRound[]>([]);
  const [revisions, setRevisions] = useState(() => revisionState(0));
  const [loading, setLoading] = useState(true);
  /**
   * Which round is open. null means "the default", which is the newest —
   * the empty string is how the newest one gets closed, since closing it
   * cannot mean falling back to the default that opens it again.
   */
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/design-feedback`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setRounds(data.feedback ?? []);
        if (data.revisions) setRevisions(data.revisions);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Reading it marks it read.
   *
   * Not a button, because a button to mark something read is a button nobody
   * presses, and an unread flag nobody clears stops meaning anything. The
   * panel only renders when there is feedback, so rendering it IS the read.
   */
  useEffect(() => {
    if (rounds.some((r) => !r.reviewedAt)) {
      fetch(`/api/projects/${projectId}/design-feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => null);
    }
  }, [rounds, projectId]);

  if (loading || rounds.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">What the client asked for</h3>
        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] ${
            revisions.remaining === 0
              ? 'border-rose-400/30 text-rose-200'
              : 'border-white/10 text-white/50'
          }`}
        >
          {revisions.used} of {revisions.included} revision rounds used
          {revisions.remaining === 0 && ' — the next one is a Change Order'}
        </span>
      </div>

      <div className="space-y-3">
        {rounds.map((round, index) => {
          const groups = GROUPS.map((g) => ({
            ...g,
            spec: FEEDBACK_KINDS.find((k) => k.kind === g.kind)!,
            items: (round.items ?? []).filter((i) => i.kind === g.kind),
          })).filter((g) => g.items.length > 0);

          /**
           * Only the newest round is the brief.
           *
           * Rounds arrive newest-first, so index 0 is the live one. With
           * three rounds stacked open at equal weight, the thing you must
           * build to is indistinguishable from two supersededS lists — and
           * building to an old one is a mistake that costs a round nobody
           * gets back. So the current round is open and labelled, and the
           * history collapses to one line you can still open.
           */
          const isCurrent = index === 0;
          const open = expanded === round.id || (isCurrent && expanded === null);
          const supersededBy = isCurrent ? null : rounds[index - 1].round;
          const noteCount = (round.items ?? []).length;

          return (
            <section
              key={round.id}
              className={`rounded-xl border p-4 ${
                isCurrent ? 'border-sky-400/25 bg-sky-400/[0.03]' : 'border-white/[0.06]'
              }`}
            >
              <button
                onClick={() => setExpanded(open ? (isCurrent ? '' : null) : round.id)}
                aria-expanded={open}
                className="mb-1 flex w-full flex-wrap items-center gap-2 text-left text-[11px] text-white/40 hover:text-white/60"
              >
                <ChevronRight
                  size={12}
                  className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                />
                <span className="font-mono uppercase tracking-[0.12em]">Round {round.round}</span>
                <span>·</span>
                <span>{new Date(round.createdAt).toLocaleDateString()}</span>
                {isCurrent ? (
                  <span className="rounded border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 font-semibold text-sky-100">
                    Build to this one
                  </span>
                ) : (
                  <span className="rounded border border-white/10 px-1.5 py-0.5 text-white/35">
                    Superseded by round {supersededBy}
                  </span>
                )}
                {round.consumedRound ? (
                  <span className="rounded border border-sky-400/25 px-1.5 py-0.5 text-sky-200/80">
                    Spent a revision round
                  </span>
                ) : (
                  <span className="rounded border border-emerald-400/25 px-1.5 py-0.5 text-emerald-200/80">
                    No round spent
                  </span>
                )}
                {!open && (
                  <span className="text-white/30">
                    {noteCount} note{noteCount === 1 ? '' : 's'}
                  </span>
                )}
              </button>

              {!open ? null : (
              <div className="mt-3">

              {round.liked && (
                <div className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200/80">
                    <CheckCircle2 size={11} />
                    What&apos;s working — don&apos;t throw this away
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-white/70">{round.liked}</p>
                </div>
              )}

              <div className="space-y-3">
                {groups.map((g) => {
                  const Icon = g.icon;
                  return (
                    <div key={g.kind} className={`rounded-lg border p-3 ${g.tone}`}>
                      <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        <Icon size={11} />
                        {g.spec.adminLabel} ({g.items.length})
                      </p>
                      <p className="mb-2 text-[11px] text-white/40">{g.caption}</p>
                      <ul className="space-y-2">
                        {g.items.map((item, i) => (
                          <li key={i} className="text-sm text-white/75">
                            <span className="font-medium text-white/90">{item.area}</span>
                            <span className="text-white/35"> — </span>
                            <span className="whitespace-pre-wrap">{item.detail}</span>
                          </li>
                        ))}
                      </ul>
                      {g.kind === 'new' && (
                        <Link
                          href={`/admin/projects/${projectId}#change-orders`}
                          className="mt-2 inline-block rounded-md border border-rose-400/30 px-2.5 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-400/10"
                        >
                          Raise a change order
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>

              {round.note && (
                <div className="mt-3 rounded-lg border border-white/[0.06] p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/35">
                    Anything else
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-white/70">{round.note}</p>
                </div>
              )}
              </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
