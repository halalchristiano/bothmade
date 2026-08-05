'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Phone,
  MailX,
  Clock,
  CalendarClock,
  RefreshCw,
  AlertTriangle,
  Check,
  ChevronRight,
  Flame,
  Headset,
  HelpCircle,
} from 'lucide-react';
import { SearchFilter, matchesSearch, Badge } from '@/components/admin/ui';
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';
import { leadLocalTime } from '@/lib/local-time';
import { formatCents } from '@/lib/pricing';
import { CALL_OUTCOMES } from '@/lib/call-outcomes';

type CallReason =
  | 'replied'
  | 'bounced'
  | 'overdue'
  | 'today'
  | 'no-follow-up'
  | 'never-contacted'
  | 'scheduled';

interface CallRow {
  id: string;
  company: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  hotLead: boolean;
  estimatedValue: number | null;
  nextFollowUpAt: string | null;
  emailDeliveryFailedReason: string | null;
  salesNote: string | null;
  reason: CallReason;
  assignedTo: { name: string | null } | null;
  lastActivity: { type: string; content: string; createdAt: string } | null;
}

const REASONS: Record<CallReason, { label: string; short: string; blurb: string; classes: string }> = {
  replied: {
    label: 'They wrote back — ring these first',
    short: 'They replied to you',
    blurb:
      "Someone at these businesses answered your email. They are the warmest leads you have and they go cold fastest — call them before anything else on this page.",
    classes: 'border-emerald-400/40 bg-emerald-400/[0.12] text-emerald-100',
  },
  bounced: {
    label: 'Email bounced — phone is the only way in',
    short: "Their email is dead — must call",
    blurb: "These addresses are dead. Nothing you send will arrive, so they can only be reached by ringing.",
    classes: 'border-red-400/30 bg-red-400/[0.07] text-red-200',
  },
  overdue: {
    label: 'Follow-up overdue',
    short: "You're late getting back to them",
    blurb: 'You said you would get back to these and the date has passed. Do these first.',
    classes: 'border-amber-400/30 bg-amber-400/[0.07] text-amber-200',
  },
  today: {
    label: 'Due today',
    short: "You said you'd call today",
    blurb: 'Booked in for today.',
    classes: 'border-sky-400/30 bg-sky-400/[0.07] text-sky-200',
  },
  'no-follow-up': {
    label: 'Contacted, but nothing booked',
    short: "Contacted once, then nothing",
    blurb: "Reached out at some point and no next step was ever set. This is the pile that quietly rots.",
    classes: 'border-purple-400/25 bg-purple-400/[0.06] text-purple-200',
  },
  'never-contacted': {
    label: 'Not contacted yet',
    short: "Nobody has spoken to them",
    blurb: 'Fresh leads nobody has spoken to.',
    classes: 'border-white/15 bg-white/[0.04] text-white/70',
  },
  scheduled: {
    label: 'Booked for a later date',
    short: "Booked for later",
    blurb: "Not on today's list — they have a follow-up date in the future.",
    classes: 'border-white/15 bg-white/[0.04] text-white/70',
  },
};

const ORDER: CallReason[] = ['replied', 'bounced', 'overdue', 'today', 'no-follow-up', 'never-contacted'];

/** Same semantics as REASONS[...].classes, expressed as Badge tones for the per-row chip. */
const REASON_TONE: Record<CallReason, 'emerald' | 'red' | 'amber' | 'sky' | 'purple' | 'neutral'> = {
  replied: 'emerald',
  bounced: 'red',
  overdue: 'amber',
  today: 'sky',
  'no-follow-up': 'purple',
  'never-contacted': 'neutral',
  scheduled: 'neutral',
};

/**
 * "Who to call" — the ranked queue, now a view inside /admin/sales rather
 * than a page of its own. It used to be one of four separate destinations
 * that all answered the same question, which is a large part of why the
 * dashboard went unopened: nothing told you which one was the front door.
 */
export function QueueView() {
  const router = useRouter();
  const [callable, setCallable] = useState<CallRow[]>([]);
  const [noPhone, setNoPhone] = useState<CallRow[]>([]);
  const [scheduledHot, setScheduledHot] = useState<CallRow[]>([]);
  const [meta, setMeta] = useState<{
    totalOpen: number;
    callsToday: number;
    breakdown: Partial<Record<CallReason, number>>;
    noPhoneCount: number;
    truncated: boolean;
    gmailStatus: 'ok' | 'needs-reconnect' | 'not-connected';
    googleOAuthAvailable: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Choosing controls. The list knows the right order; these let a rep pick a
  // business to actually ring now — which the order alone can't, because the
  // most urgent lead is often one where it's the middle of the night.
  const [showBreakdown, setShowBreakdown] = useState(false);
  // Restored from last session so switching to "biggest deal first" sticks
  // around instead of quietly resetting every time the page is left and
  // come back to.
  const [readyNow, setReadyNow] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('bothmade_call_list_ready_now') === 'true';
    } catch {
      return false;
    }
  });
  const [sortBy, setSortBy] = useState<'urgent' | 'value' | 'time'>(() => {
    if (typeof window === 'undefined') return 'urgent';
    try {
      const stored = localStorage.getItem('bothmade_call_list_sort');
      return stored === 'value' || stored === 'time' ? stored : 'urgent';
    } catch {
      return 'urgent';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('bothmade_call_list_ready_now', String(readyNow));
    } catch {
      /* ignore */
    }
  }, [readyNow]);

  useEffect(() => {
    try {
      localStorage.setItem('bothmade_call_list_sort', sortBy);
    } catch {
      /* ignore */
    }
  }, [sortBy]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Tapping a tel: link is the one moment we genuinely know a call was
  // started — a browser cannot read the phone's call history, on any OS. So
  // we remember who was dialled and ask on the way back, rather than relying
  // on him to come and log it unprompted.
  const [pendingCall, setPendingCall] = useState<{ id: string; company: string; at: number } | null>(null);
  const [savingQuick, setSavingQuick] = useState(false);
  const [quickOutcomeError, setQuickOutcomeError] = useState('');
  const [snoozingId, setSnoozingId] = useState<string | null>(null);

  /**
   * Push a lead's follow-up out and drop it off today's list.
   *
   * The queue's whole promise is "work down it until it's empty", and until
   * now the only way to deal with a row you had decided not to ring was to
   * ring it anyway or leave it there. So it stayed at the top, every day,
   * until the list stopped meaning anything. Deciding "not today" is a real
   * outcome and it needs one click.
   */
  const snooze = async (row: CallRow, days: number) => {
    setSnoozingId(row.id);
    try {
      const res = await fetch(`/api/admin/leads/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextFollowUpAt: new Date(Date.now() + days * 86_400_000).toISOString(),
        }),
      });
      if (!res.ok) return;
      // Off the list immediately rather than after a refetch — the queue is
      // worked at speed and a row that lingers gets actioned twice.
      setCallable((prev) => prev.filter((r) => r.id !== row.id));
    } finally {
      setSnoozingId(null);
    }
  };

  const load = async () => {
    try {
      const res = await fetch('/api/admin/leads/call-list');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCallable(data.callable);
        setNoPhone(data.noPhone);
        setScheduledHot(data.scheduledHot ?? []);
        setMeta({
          totalOpen: data.totalOpen ?? 0,
          callsToday: data.callsToday ?? 0,
          breakdown: data.breakdown ?? {},
          noPhoneCount: data.noPhoneCount ?? 0,
          truncated: !!data.truncated,
          gmailStatus: data.gmailStatus ?? 'ok',
          googleOAuthAvailable: data.googleOAuthAvailable !== false,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Survives the page being backgrounded while the dialler is open, which is
  // exactly what happens on a phone.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pendingCall');
      if (raw) setPendingCall(JSON.parse(raw));
    } catch {
      /* a corrupt entry just means no prompt */
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const raw = sessionStorage.getItem('pendingCall');
        if (raw) setPendingCall(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const startCall = (row: CallRow) => {
    const entry = { id: row.id, company: row.company, at: Date.now() };
    try {
      sessionStorage.setItem('pendingCall', JSON.stringify(entry));
    } catch {
      /* private mode — the prompt just won't survive a reload */
    }
    setQuickOutcomeError('');
    setPendingCall(entry);
  };

  const clearPendingCall = () => {
    try {
      sessionStorage.removeItem('pendingCall');
    } catch {
      /* ignore */
    }
    setPendingCall(null);
  };

  const logQuickOutcome = async (key: string) => {
    if (!pendingCall) return;
    setSavingQuick(true);
    setQuickOutcomeError('');
    try {
      const res = await fetch(`/api/admin/leads/${pendingCall.id}/call-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: key }),
      });
      if (res.ok) {
        clearPendingCall();
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        setQuickOutcomeError(data.error || "Couldn't log that outcome — try again.");
      }
    } catch {
      setQuickOutcomeError('Could not reach the server — check your connection and try again.');
    } finally {
      setSavingQuick(false);
    }
  };

  const syncBounces = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/admin/email/sync-bounces', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error || 'Could not check for bounces.');
        return;
      }
      const parts = [
        data.repliesFlagged > 0 &&
          `${data.repliesFlagged} ${data.repliesFlagged === 1 ? 'business has' : 'businesses have'} written back — they're at the top of your list`,
        data.flagged > 0 &&
          `${data.flagged} ${data.flagged === 1 ? 'address' : 'addresses'} bounced — call those instead of emailing`,
      ].filter(Boolean);
      setSyncMessage(
        parts.length > 0 ? `${parts.join('. ')}.` : 'Checked your inbox — nothing new.'
      );
      if (data.flagged > 0 || data.repliesFlagged > 0) load();
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading your call list…</p>
      </div>
    );
  }

  const match = (r: CallRow) => matchesSearch(search, r.company, r.contactName, r.phone, r.email);
  const now = new Date(nowTick);

  // A number we can't place is treated as callable: hiding a lead because we
  // couldn't read its area code would quietly lose work.
  const callableNow = (r: CallRow) => (leadLocalTime(r.phone, now)?.callability ?? 'okay') !== 'bad';

  const searched = callable.filter(match);
  const readyCount = searched.filter(callableNow).length;
  const visible = readyNow ? searched.filter(callableNow) : searched;
  const visibleNoPhone = noPhone.filter(match);
  const visibleScheduledHot = scheduledHot.filter(match);

  const RANK = { good: 0, okay: 1, bad: 2 } as const;
  const sortRows = (rows: CallRow[]) => {
    if (sortBy === 'urgent') return rows; // already ordered by the server
    const copy = [...rows];
    if (sortBy === 'value') {
      copy.sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0));
    } else {
      copy.sort(
        (a, b) =>
          RANK[leadLocalTime(a.phone, now)?.callability ?? 'okay'] -
          RANK[leadLocalTime(b.phone, now)?.callability ?? 'okay']
      );
    }
    return copy;
  };

  // Sorting by value or by time is a deliberate override of the urgency
  // grouping, so present one flat list rather than pretending both apply.
  const flat = sortBy !== 'urgent';
  const grouped = flat
    ? [{ reason: 'today' as CallReason, rows: sortRows(visible) }].filter((g) => g.rows.length > 0)
    : ORDER.map((r) => ({ reason: r, rows: visible.filter((c) => c.reason === r) })).filter(
        (g) => g.rows.length > 0
      );
  const total = visible.length;
  const nextUp = sortRows(visible)[0] ?? null;

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          {/* Progress. The list only ever shows what's left, which makes a
              long day feel like no progress at all. */}
          {meta && meta.callsToday > 0 && (
            <p className="text-xs text-emerald-300/80 font-semibold mb-1.5">
              {meta.callsToday} {meta.callsToday === 1 ? 'call' : 'calls'} logged today — nice one.
            </p>
          )}
          <p className="text-sm text-white/45">
            {total === 0
              ? 'Nothing waiting on a call right now.'
              : `${total} ${total === 1 ? 'business' : 'businesses'} to ring, most urgent first. Work down the list.`}
          </p>
          {/* Every open lead falls into exactly one of these and the figures
              reconcile with the total, so the number is never a mystery. */}
          {meta && meta.totalOpen > 0 && (
            <button
              onClick={() => setShowBreakdown((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 mt-2.5 text-xs font-semibold text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              <HelpCircle size={13} />
              {showBreakdown ? 'Hide the maths' : 'Why these businesses?'}
            </button>
          )}
        </div>
        <button
          onClick={syncBounces}
          disabled={syncing}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 text-xs font-semibold hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Checking...' : 'Check my inbox'}
        </button>
      </div>

      {showBreakdown && meta && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-white/50 leading-relaxed mb-3">
            Every open lead lands in exactly one row below. Won and lost leads are excluded entirely.
          </p>
          <div className="space-y-1.5 text-xs">
            {(
              [
                ['replied', REASONS.replied.label],
                ['bounced', REASONS.bounced.label],
                ['overdue', REASONS.overdue.label],
                ['today', REASONS.today.label],
                ['no-follow-up', REASONS['no-follow-up'].label],
                ['never-contacted', REASONS['never-contacted'].label],
                ['scheduled', REASONS.scheduled.label],
              ] as Array<[CallReason, string]>
            ).map(([key, label]) => (
              <div key={key} className="flex justify-between gap-3">
                <span className={key === 'scheduled' ? 'text-white/30' : 'text-white/55'}>
                  {label}
                  {key === 'scheduled' && ' (not on the list)'}
                </span>
                <span className="font-semibold text-white/70 tabular-nums">{meta.breakdown[key] ?? 0}</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-white/10 pt-2 mt-2">
              <span className="text-white/70 font-semibold">Total open leads</span>
              <span className="font-bold text-white/90 tabular-nums">{meta.totalOpen}</span>
            </div>
            {meta.noPhoneCount > 0 && (
              <p className="text-white/30 pt-2 leading-relaxed">
                Of those due a contact, {meta.noPhoneCount} have no phone number and are listed separately at the
                bottom — they need a number finding, or an email instead.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-5">
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Find a business in your call list..."
          count={visible.length + visibleNoPhone.length}
          total={callable.length + noPhone.length}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 -mt-1 mb-1">
        <button
          onClick={() => setReadyNow((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            readyNow
              ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
              : 'border-white/15 text-white/55 hover:bg-white/5'
          }`}
        >
          {readyNow && <Check size={12} />}
          Sensible hour there ({readyCount})
        </button>
        {(['urgent', 'value', 'time'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSortBy(k)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              sortBy === k
                ? 'border-sky-400/40 bg-sky-400/15 text-sky-200'
                : 'border-white/15 text-white/55 hover:bg-white/5'
            }`}
          >
            {k === 'urgent' ? 'Most urgent' : k === 'value' ? 'Biggest deal' : 'Best time to call'}
          </button>
        ))}
      </div>

      {nextUp && (
        <div className="mb-5 rounded-2xl border border-sky-400/25 bg-sky-400/[0.07] p-4">
          <p className="text-[11px] uppercase tracking-wide text-sky-300/80 font-semibold mb-1.5">
            If you don't know where to start, call this one
          </p>
          <p className="text-base font-bold text-white/90 break-words">{nextUp.company}</p>
          {(() => {
            const lt = leadLocalTime(nextUp.phone, now);
            return (
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                {REASONS[nextUp.reason].label}
                {lt?.time ? ` · ${lt.time} their time` : ''}
                {nextUp.estimatedValue ? ` · ${formatCents(nextUp.estimatedValue)}` : ''}
              </p>
            );
          })()}
          <div className="flex gap-2 mt-3">
            <Link
              href={`/admin/call/${nextUp.id}`}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-400/15 border border-emerald-400/30 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/25 transition-colors"
            >
              <Headset size={14} /> Start this call
            </Link>
            <a
              href={`tel:${nextUp.phone}`}
              onClick={() => startCall(nextUp)}
              aria-label={`Call ${nextUp.company}`}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2.5 text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              <Phone size={14} /> Dial
            </a>
            <Link
              href={`/admin/leads/${nextUp.id}`}
              className="shrink-0 rounded-lg border border-white/15 px-3.5 py-2.5 text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Brief
            </Link>
          </div>
        </div>
      )}

      {/* Two features sit silently dead without this, and a token that can send
          but not read looks perfectly healthy from the outside — so it has to
          be said plainly, where the work happens, not buried in Settings. */}
      {meta && meta.gmailStatus !== 'ok' && (
        <div className="mb-5 rounded-2xl border border-amber-400/35 bg-amber-400/[0.1] p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-100">
            <AlertTriangle size={14} />
            {!meta.googleOAuthAvailable
              ? "Replies and bounces are invisible — needs a setup step"
              : meta.gmailStatus === 'not-connected'
                ? "Your email isn't connected yet"
                : 'Reconnect your email — one tap'}
          </p>
          <p className="text-xs text-amber-100/75 mt-1.5 leading-relaxed">
            {!meta.googleOAuthAvailable
              ? "This page can't tell you who replied or whose address is dead, and it can't be fixed from here yet — Google sign-in hasn't been set up on this deployment (it needs GOOGLE_OAUTH_CLIENT_ID/SECRET). Sending your emails still works fine in the meantime."
              : meta.gmailStatus === 'not-connected'
                ? "Until it is, this page can't tell you who replied to you or whose email address is dead. Both go to the top of your list once it's connected."
                : "Your connection can send email but not read it, so replies and bounced addresses are invisible right now. Reconnecting takes one tap and fixes both."}
          </p>
          {meta.googleOAuthAvailable && (
            <a
              href="/api/admin/settings/gmail-oauth/start"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 px-4 py-2 mt-3 text-sm font-semibold text-amber-100 hover:bg-amber-400/10 transition-colors"
            >
              {meta.gmailStatus === 'not-connected' ? 'Connect Google' : 'Reconnect Google'}
            </a>
          )}
        </div>
      )}

      {meta?.truncated && (
        <p className="text-xs text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-4">
          You have more open leads than this page loads at once. The most urgent are shown — clear some down and
          the rest will appear.
        </p>
      )}

      {pendingCall && (
        <div className="mb-5 rounded-2xl border border-sky-400/30 bg-sky-400/[0.1] p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white/90 break-words">
                You called {pendingCall.company} — how did it go?
              </p>
              <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
                One tap logs it, moves them along and books the next follow-up.
              </p>
            </div>
            <button
              onClick={clearPendingCall}
              className="shrink-0 text-xs text-white/40 hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CALL_OUTCOMES.filter((o) => !o.askForDate).map((o) => (
              <button
                key={o.key}
                onClick={() => logQuickOutcome(o.key)}
                disabled={savingQuick}
                className={`rounded-xl border px-3 py-2 text-left text-xs font-bold disabled:opacity-40 transition-colors ${
                  o.tone === 'good'
                    ? 'border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-100 hover:bg-emerald-400/15'
                    : o.tone === 'bad'
                      ? 'border-red-400/25 bg-red-400/[0.06] text-red-100 hover:bg-red-400/15'
                      : 'border-white/12 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {quickOutcomeError && (
            <p className="text-xs text-red-300 mt-2.5" role="alert">
              {quickOutcomeError}
            </p>
          )}
          <Link
            href={`/admin/leads/${pendingCall.id}`}
            className="block text-center text-xs text-sky-300 hover:text-sky-200 mt-2.5 transition-colors"
          >
            Or open their page to add a note
          </Link>
        </div>
      )}

      {syncMessage && (
        <p className="text-xs text-sky-300 bg-sky-400/10 border border-sky-400/20 rounded-lg px-3 py-2 mt-3">
          {syncMessage}
        </p>
      )}

      {total === 0 && visibleNoPhone.length === 0 && !search && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <Phone size={26} className="text-white/25 mx-auto mb-3" />
          <p className="text-sm text-white/60">
            Nothing to ring. Every lead is either booked for a future date, won, or closed off.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-7">
        {grouped.map(({ reason, rows }) => {
          const meta = REASONS[reason];
          return (
            <section key={reason}>
              <div className={`rounded-xl border px-3.5 py-2.5 mb-3 ${flat ? 'border-white/15 bg-white/[0.04] text-white/70' : meta.classes}`}>
                <p className="text-sm font-bold flex items-center gap-1.5">
                  {!flat && reason === 'bounced' && <MailX size={14} />}
                  {!flat && reason === 'overdue' && <AlertTriangle size={14} />}
                  {flat ? (sortBy === 'value' ? 'Biggest deals first' : 'Best time to call first') : meta.label}
                  <span className="ml-1 opacity-60 font-semibold">({rows.length})</span>
                </p>
                <p className="text-xs opacity-70 mt-0.5 leading-relaxed">
                  {flat
                    ? 'Urgency grouping is off while this sort is on — switch back to "Most urgent" to see it.'
                    : meta.blurb}
                </p>
              </div>

              <div className="space-y-2">
                {rows.map((row) => {
                  const lt = leadLocalTime(row.phone, new Date(nowTick));
                  const timeColour =
                    lt?.callability === 'good'
                      ? 'text-emerald-300'
                      : lt?.callability === 'okay'
                        ? 'text-amber-300'
                        : 'text-red-300';
                  return (
                    <div
                      key={row.id}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 min-w-0"
                    >
                      {/* On the row, not just the band header — the header
                          disappears the moment a different sort is chosen. */}
                      <div className="mb-2">
                        <Badge tone={REASON_TONE[row.reason]} solid>
                          {REASONS[row.reason].short}
                        </Badge>
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/admin/leads/${row.id}`} className="min-w-0 group">
                          <p className="text-sm font-bold text-white/90 group-hover:text-sky-300 transition-colors break-words">
                            {row.hotLead && (
                              <Flame size={12} className="inline -mt-0.5 mr-1 text-amber-400" aria-label="Hot lead" />
                            )}
                            {row.company}
                          </p>
                          <p className="text-xs text-white/40 mt-0.5 break-words">
                            {row.contactName || 'No contact name'} · {LEAD_STATUS_LABELS[row.status]}
                            {row.estimatedValue ? ` · ${formatCents(row.estimatedValue)}` : ''}
                          </p>
                        </Link>
                        <Link
                          href={`/admin/leads/${row.id}`}
                          className="shrink-0 text-white/25 hover:text-white transition-colors"
                          aria-label={`Open ${row.company}`}
                        >
                          <ChevronRight size={16} />
                        </Link>
                      </div>

                      {lt && (
                        <p className="text-xs mt-2 leading-relaxed">
                          {lt.time && <span className={`font-semibold ${timeColour}`}>{lt.time} their time — </span>}
                          <span className="text-white/40">{lt.advice}</span>
                        </p>
                      )}

                      {row.reason === 'bounced' && row.emailDeliveryFailedReason && (
                        <p className="text-xs text-red-200/80 mt-1.5 leading-relaxed break-words">
                          {row.emailDeliveryFailedReason}
                        </p>
                      )}

                      {row.reason === 'overdue' && row.nextFollowUpAt && (
                        <p className="flex items-center gap-1 text-xs text-amber-300/80 mt-1.5">
                          <Clock size={11} /> Was due{' '}
                          {new Date(row.nextFollowUpAt).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                      )}

                      {row.salesNote && (
                        <p className="text-xs text-sky-200/70 mt-1.5 leading-relaxed break-words">
                          {row.salesNote}
                        </p>
                      )}

                      {row.lastActivity && (
                        <p className="text-xs text-white/30 mt-1.5 leading-relaxed break-words">
                          Last: {row.lastActivity.content.slice(0, 110)}
                          {row.lastActivity.content.length > 110 ? '…' : ''}
                        </p>
                      )}

                      <div className="flex gap-2 mt-3">
                        <Link
                          href={`/admin/call/${row.id}`}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-400/15 border border-emerald-400/30 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/25 transition-colors"
                        >
                          <Headset size={13} /> Start call
                        </Link>
                        <a
                          href={`tel:${row.phone}`}
                          onClick={() => startCall(row)}
                          title={`Call ${row.phone}`}
                          aria-label={`Call ${row.company} on ${row.phone}`}
                          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                        >
                          <Phone size={13} /> Dial
                        </a>
                        <Link
                          href={`/admin/leads/${row.id}`}
                          className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/5 transition-colors"
                        >
                          Brief
                        </Link>
                      </div>

                      {/* "Not today." The only outcome the queue had no button
                          for, which is how a list you are meant to empty ends
                          up with the same names on it every morning. */}
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[11px] text-white/25">Not today —</span>
                        {[
                          [1, 'tomorrow'],
                          [3, '3 days'],
                          [7, 'a week'],
                        ].map(([days, label]) => (
                          <button
                            key={label}
                            onClick={() => snooze(row, days as number)}
                            disabled={snoozingId === row.id}
                            className="rounded-md px-1.5 py-0.5 text-[11px] text-white/45 hover:text-white hover:bg-white/[0.07] disabled:opacity-40 transition-colors"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {visibleScheduledHot.length > 0 && (
        <section className="mt-8">
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-3.5 py-2.5 mb-3">
            <p className="text-sm font-bold text-amber-200 flex items-center gap-1.5">
              <Flame size={14} /> Hot, booked for later
              <span className="ml-1 opacity-60">({visibleScheduledHot.length})</span>
            </p>
            <p className="text-xs text-amber-200/50 mt-0.5 leading-relaxed">
              Not due today, but worth knowing they're coming up.
            </p>
          </div>
          <div className="space-y-2">
            {visibleScheduledHot.map((row) => (
              <Link
                key={row.id}
                href={`/admin/leads/${row.id}`}
                className="block rounded-xl border border-amber-400/10 bg-white/[0.02] p-3 hover:bg-white/[0.05] transition-colors min-w-0"
              >
                <p className="text-sm font-semibold text-white/80 break-words">{row.company}</p>
                <p className="text-xs text-white/35 mt-0.5">
                  {row.nextFollowUpAt &&
                    `Booked for ${new Date(row.nextFollowUpAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}`}
                  {row.estimatedValue ? ` · ${formatCents(row.estimatedValue)}` : ''}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {visibleNoPhone.length > 0 && (
        <section className="mt-8">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 mb-3">
            <p className="text-sm font-bold text-white/70 flex items-center gap-1.5">
              <CalendarClock size={14} /> No phone number on file
              <span className="ml-1 opacity-60">({visibleNoPhone.length})</span>
            </p>
            <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
              These are due a contact but there is nothing to ring. Find a number, or email them instead.
            </p>
          </div>
          <div className="space-y-2">
            {visibleNoPhone.map((row) => (
              <Link
                key={row.id}
                href={`/admin/leads/${row.id}`}
                className="block rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 hover:bg-white/[0.05] transition-colors min-w-0"
              >
                <p className="text-sm font-semibold text-white/80 break-words">{row.company}</p>
                <p className="text-xs text-white/35 mt-0.5">
                  {REASONS[row.reason].label}
                  {row.email ? ` · ${row.email}` : ' · no email either'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
