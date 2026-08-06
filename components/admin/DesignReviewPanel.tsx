'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, ExternalLink, Eye, Link2, MessageSquare } from 'lucide-react';
import { BrandButton, inputClass } from '@/components/admin/ui';
import { designStage, nextDesignStage } from '@/lib/design-stages';

/**
 * The whole design conversation on one panel: send it, wait, read what came
 * back, send the next one.
 *
 * Two things were missing and both mattered.
 *
 * There was nowhere to put the design. "Send the design for review" started
 * the Section 4 clock and emailed a deadline, and the client's dashboard then
 * asked them to approve something it had no way to show them — the link went
 * over separately by hand, or not at all.
 *
 * And nothing said which round this was. Exhibit A gives the Design milestone
 * "an original visual design concept for review; up to two (2) rounds of
 * revisions" — three things, of which the first is not a revision. The client
 * was being told the opening concept was "revision 1 of the 2 included",
 * which reads as having spent half the allowance before saying a word.
 *
 * So the round is named before it is sent, on both sides, in the same words.
 */

export interface DesignReview {
  presentedAt: string | null;
  reviewEndsAt: string | null;
  approvedAt: string | null;
  deemed: boolean;
  round?: number;
  designUrl?: string | null;
  revisionsUsed?: number;
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export function DesignReviewPanel({
  projectId,
  review,
  onChanged,
}: {
  projectId: string;
  review: DesignReview;
  onChanged: () => void;
}) {
  const [note, setNote] = useState('');
  const [designUrl, setDesignUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const round = review.round ?? 1;
  /*
   * What the next send will be called.
   *
   * A design already presented and answered means the next one is a new
   * round; nothing presented yet means the next one is round 1. The round
   * itself advances server-side on presenting — this only has to name it, so
   * whoever is about to press the button knows what the client will be told.
   */
  const nextStage = review.presentedAt ? nextDesignStage(round) : designStage(round);
  const currentStage = designStage(round);

  const present = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/design-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, designUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setNotice(
        data.emailSent
          ? `${data.stage?.label ?? 'Sent'} is with them. They have until ${data.reviewEndsLabel} to respond.`
          : `The clock has started — they have until ${data.reviewEndsLabel} — but the email didn't go out. Tell them yourself.`
      );
      setNote('');
      setDesignUrl('');
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const recordApproval = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/design-review`, { method: 'PATCH' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Something went wrong.');
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  /** The link, wherever this panel is showing one. */
  const OpenDesign = ({ url, tone }: { url: string; tone: string }) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium ${tone}`}
    >
      Open the design <ExternalLink size={11} />
    </a>
  );

  // Approved, one way or the other.
  if (review.approvedAt) {
    return (
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-3.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-200">
          <CheckCircle2 size={14} />
          {currentStage.label} approved
        </p>
        {/* Which kind matters if it is ever disputed. */}
        <p className="mt-1 text-xs text-white/45">
          {review.deemed
            ? `No response by ${dateLabel(review.reviewEndsAt ?? review.approvedAt)}, so it was approved under Section 4 of the agreement.`
            : `Approved by the client on ${dateLabel(review.approvedAt)}.`}
        </p>
        {review.designUrl && <OpenDesign url={review.designUrl} tone="text-emerald-300 hover:text-emerald-200" />}
      </div>
    );
  }

  // Clock running.
  if (review.presentedAt && review.reviewEndsAt) {
    const endsAt = new Date(review.reviewEndsAt);
    const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000));
    return (
      <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.05] p-3.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-200">
          <Clock size={14} />
          {currentStage.label} — waiting on their review
        </p>
        <p className="mt-1 text-xs text-white/55">
          Presented {dateLabel(review.presentedAt)}.{' '}
          {daysLeft > 0
            ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left — approved automatically on ${dateLabel(review.reviewEndsAt)} if they don't reply.`
            : `The period is up — it will be approved automatically overnight.`}
        </p>
        {review.designUrl && <OpenDesign url={review.designUrl} tone="text-sky-300 hover:text-sky-200" />}
        <button
          onClick={recordApproval}
          disabled={busy}
          className="mt-2.5 block text-[11px] text-emerald-300 transition-colors hover:text-emerald-200 disabled:opacity-40"
        >
          They&apos;ve approved it — record that now
        </button>
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  /*
   * Presented, and answered with changes.
   *
   * The feedback route clears the review deadline — a client who has told us
   * what is wrong must not have their design approved out from under them
   * five days later. That left this panel showing its blank "not started"
   * state on a project mid-conversation, which reads as though nothing had
   * ever been sent.
   */
  const awaitingNextRound = Boolean(review.presentedAt);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        {awaitingNextRound ? (
          <>
            <MessageSquare size={14} className="text-amber-300" />
            They asked for changes
          </>
        ) : (
          <>
            <Eye size={14} className="text-white/50" />
            Design review
          </>
        )}
      </p>

      {/* What is about to be sent, named, before it is sent. */}
      <div className="mt-2 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-sky-300/80">Sending next</p>
        <p className="text-sm font-semibold text-sky-100">{nextStage.label}</p>
        <p className="mt-0.5 text-xs text-white/50">{nextStage.meaning}</p>
      </div>

      <p className="mt-2.5 text-xs text-white/40">
        Starts the five-working-day review period in Section 4. If they don&apos;t reply, the design
        is approved on its own and Payment 2 falls due — which only holds up if they were told the
        deadline, so the email says it.
      </p>

      {/* The design itself. Without this the client's dashboard asks them to
          approve something it cannot show, which is most of why this panel
          needed rewriting. */}
      <label className="mt-2.5 block">
        <span className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
          <Link2 size={11} /> Where the design is
        </span>
        <input
          value={designUrl}
          onChange={(e) => setDesignUrl(e.target.value)}
          placeholder={review.designUrl ?? 'figma.com/file/… or the preview build'}
          className={inputClass}
        />
      </label>
      {review.designUrl && !designUrl && (
        <p className="mt-1 text-[11px] text-white/35">
          Leave blank to keep the link already on this project.
        </p>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={
          awaitingNextRound
            ? "What changed since last time — the more specific, the fewer rounds it takes…"
            : "Anything to say alongside it — what to look at, what's changed…"
        }
        className={`${inputClass} mt-2.5 resize-none`}
      />
      {notice && <p className="mt-2 text-xs text-emerald-300">{notice}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <BrandButton onClick={present} disabled={busy} className="mt-2.5 w-full justify-center text-sm">
        {busy ? 'Sending…' : `Send ${nextStage.label.toLowerCase()} for review`}
      </BrandButton>
    </div>
  );
}
