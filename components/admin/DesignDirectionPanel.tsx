'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Compass, ThumbsDown, ThumbsUp } from 'lucide-react';
import { deliverableHref } from '@/lib/deliverables';

/**
 * The brief the concept has to be judged against.
 *
 * Its whole value is being visible at two moments: when you're about to
 * present a design, and when their feedback lands. At the first it tells you
 * what you promised; at the second it tells you whether a complaint is our
 * mistake to fix free or their change of mind spending a round. Filed away
 * somewhere you have to go looking for, it settles nothing.
 *
 * The warning when there ISN'T one is deliberately the loudest thing here.
 * Presenting without a brief is allowed — blocking would stop work on a
 * client who is simply slow with a form — but it should never happen quietly,
 * because the moment it does, "that's not what I asked for" becomes
 * unanswerable and comes out of their revision rounds either way.
 */

interface Reference {
  url: string;
  why: string;
}

interface Direction {
  likes: Reference[];
  dislikes: Reference[];
  adjectives: string[];
  untouchable: string | null;
  hardNos: string | null;
  notes: string | null;
  sentAt: string | null;
  signedAt: string | null;
  signerName: string | null;
}

interface Status {
  exists: boolean;
  signed: boolean;
  warning: string | null;
}

function RefList({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string;
  items: Reference[];
  icon: typeof ThumbsUp;
  tone: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
        <Icon size={11} />
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((r, i) => {
          const href = deliverableHref(r.url);
          return (
            <li key={i} className="text-sm">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-300 hover:underline"
                >
                  {r.url}
                </a>
              ) : (
                <span className="text-white/85">{r.url}</span>
              )}
              {r.why && <span className="text-white/50"> — {r.why}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DesignDirectionPanel({ projectId }: { projectId: string }) {
  const [direction, setDirection] = useState<Direction | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/design-direction`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setDirection(data.direction);
        setStatus(data.status);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !status) return null;

  if (!status.signed) {
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-5">
        <p className="mb-1.5 flex items-center gap-2 text-sm font-bold text-amber-200">
          <AlertTriangle size={14} />
          {status.exists ? 'Design brief sent, not signed' : 'No design brief on file'}
        </p>
        <p className="text-sm text-white/60">{status.warning}</p>
        <p className="mt-2 text-xs text-white/35">
          It&apos;s on their dashboard — a nudge in the message box is usually enough.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Compass size={14} className="text-purple-300" />
          The brief they signed
        </h3>
        <span className="text-[11px] text-white/35">
          {direction?.signerName} ·{' '}
          {direction?.signedAt && new Date(direction.signedAt).toLocaleDateString()}
        </span>
      </div>

      {direction?.adjectives?.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {direction.adjectives.map((word) => (
            <span
              key={word}
              className="rounded-lg border border-purple-400/25 bg-purple-400/[0.07] px-2.5 py-1 text-sm font-medium text-purple-100"
            >
              {word}
            </span>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        <RefList title="Liked" items={direction?.likes ?? []} icon={ThumbsUp} tone="text-emerald-200/80" />
        <RefList title="Disliked" items={direction?.dislikes ?? []} icon={ThumbsDown} tone="text-rose-200/80" />

        {direction?.untouchable && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/35">
              Must not change
            </p>
            <p className="whitespace-pre-wrap text-sm text-white/70">{direction.untouchable}</p>
          </div>
        )}
        {direction?.hardNos && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/35">
              Hard no&apos;s
            </p>
            <p className="whitespace-pre-wrap text-sm text-white/70">{direction.hardNos}</p>
          </div>
        )}
        {direction?.notes && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/35">
              Anything else
            </p>
            <p className="whitespace-pre-wrap text-sm text-white/70">{direction.notes}</p>
          </div>
        )}
      </div>

      {/* The sentence that makes the brief worth having. Kept on screen
          because it is the rule you apply when their feedback arrives, and
          it is easy to forget which way it cuts. */}
      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-white/35">
        Anything you present that departs from this is a Section 4 non-conformance — fix it free,
        and it doesn&apos;t come out of their two rounds. A change of mind about the direction
        itself is a revision.
      </p>
    </div>
  );
}
