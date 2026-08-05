'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, Eye } from 'lucide-react';
import { BrandButton, inputClass } from '@/components/admin/ui';

/**
 * The Section 4 review clock, made visible.
 *
 * Payment 2 is due on Design Approval, "including deemed approval" after five
 * business days of client silence. That clause is the one that most protects
 * the studio, and it was the only thing in the agreement nothing tracked: a
 * design went over on a call, the clock started somewhere nobody could see,
 * and a client who simply never replied left the payment gate shut forever.
 *
 * So the clock is started deliberately, the deadline is a date the client is
 * told in writing, and it lapses on its own overnight. What this panel does
 * is make all three legible on the one screen somebody actually opens.
 */

export interface DesignReview {
  presentedAt: string | null;
  reviewEndsAt: string | null;
  approvedAt: string | null;
  deemed: boolean;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const present = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/design-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setNotice(
        data.emailSent
          ? `Sent. They have until ${data.reviewEndsLabel} to respond.`
          : `The clock has started — they have until ${data.reviewEndsLabel} — but the email didn't go out. Tell them yourself.`
      );
      setNote('');
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

  // Approved, one way or the other.
  if (review.approvedAt) {
    return (
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-3.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-200">
          <CheckCircle2 size={14} />
          Design approved
        </p>
        {/* Which kind matters if it is ever disputed. */}
        <p className="mt-1 text-xs text-white/45">
          {review.deemed
            ? `No response by ${dateLabel(review.reviewEndsAt ?? review.approvedAt)}, so it was approved under Section 4 of the agreement.`
            : `Approved by the client on ${dateLabel(review.approvedAt)}.`}
        </p>
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
          Waiting on their review
        </p>
        <p className="mt-1 text-xs text-white/55">
          Presented {dateLabel(review.presentedAt)}.{' '}
          {daysLeft > 0
            ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left — approved automatically on ${dateLabel(review.reviewEndsAt)} if they don't reply.`
            : `The period is up — it will be approved automatically overnight.`}
        </p>
        <button
          onClick={recordApproval}
          disabled={busy}
          className="mt-2.5 text-[11px] text-emerald-300 transition-colors hover:text-emerald-200 disabled:opacity-40"
        >
          They&apos;ve approved it — record that now
        </button>
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  // Not started.
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Eye size={14} className="text-white/50" />
        Design review
      </p>
      <p className="mt-1 text-xs text-white/40">
        Starts the five-working-day review period in Section 4. If they don&apos;t reply, the design
        is approved on its own and Payment 2 falls due — which only holds up if they were told the
        deadline, so the email says it.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Anything to say alongside it — what to look at, what's changed…"
        className={`${inputClass} mt-2.5 resize-none`}
      />
      {notice && <p className="mt-2 text-xs text-emerald-300">{notice}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <BrandButton onClick={present} disabled={busy} className="mt-2.5 w-full justify-center text-sm">
        {busy ? 'Sending…' : 'Send the design for review'}
      </BrandButton>
    </div>
  );
}
