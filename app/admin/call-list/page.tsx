'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Phone, MailX, Clock, CalendarClock, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { PageIn, SearchFilter, matchesSearch } from '@/components/admin/ui';
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';
import { leadLocalTime } from '@/lib/local-time';
import { formatCents } from '@/lib/pricing';

type CallReason = 'bounced' | 'overdue' | 'today' | 'no-follow-up' | 'never-contacted' | 'scheduled';

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

const REASONS: Record<CallReason, { label: string; blurb: string; classes: string }> = {
  bounced: {
    label: 'Email bounced — phone is the only way in',
    blurb: "These addresses are dead. Nothing you send will arrive, so they can only be reached by ringing.",
    classes: 'border-red-400/30 bg-red-400/[0.07] text-red-200',
  },
  overdue: {
    label: 'Follow-up overdue',
    blurb: 'You said you would get back to these and the date has passed. Do these first.',
    classes: 'border-amber-400/30 bg-amber-400/[0.07] text-amber-200',
  },
  today: {
    label: 'Due today',
    blurb: 'Booked in for today.',
    classes: 'border-sky-400/30 bg-sky-400/[0.07] text-sky-200',
  },
  'no-follow-up': {
    label: 'Contacted, but nothing booked',
    blurb: "Reached out at some point and no next step was ever set. This is the pile that quietly rots.",
    classes: 'border-purple-400/25 bg-purple-400/[0.06] text-purple-200',
  },
  'never-contacted': {
    label: 'Not contacted yet',
    blurb: 'Fresh leads nobody has spoken to.',
    classes: 'border-white/15 bg-white/[0.04] text-white/70',
  },
  scheduled: {
    label: 'Booked for a later date',
    blurb: "Not on today's list — they have a follow-up date in the future.",
    classes: 'border-white/15 bg-white/[0.04] text-white/70',
  },
};

const ORDER: CallReason[] = ['bounced', 'overdue', 'today', 'no-follow-up', 'never-contacted'];

export default function CallListPage() {
  const router = useRouter();
  const [callable, setCallable] = useState<CallRow[]>([]);
  const [noPhone, setNoPhone] = useState<CallRow[]>([]);
  const [meta, setMeta] = useState<{
    totalOpen: number;
    breakdown: Partial<Record<CallReason, number>>;
    noPhoneCount: number;
    truncated: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Choosing controls. The list knows the right order; these let a rep pick a
  // business to actually ring now — which the order alone can't, because the
  // most urgent lead is often one where it's the middle of the night.
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [readyNow, setReadyNow] = useState(false);
  const [sortBy, setSortBy] = useState<'urgent' | 'value' | 'time'>('urgent');
  const [nowTick, setNowTick] = useState(() => Date.now());

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
        setMeta({
          totalOpen: data.totalOpen ?? 0,
          breakdown: data.breakdown ?? {},
          noPhoneCount: data.noPhoneCount ?? 0,
          truncated: !!data.truncated,
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
      setSyncMessage(
        data.flagged > 0
          ? `Found ${data.flagged} bounced ${data.flagged === 1 ? 'address' : 'addresses'} — moved to the top of your list.`
          : `Checked ${data.scanned} bounce ${data.scanned === 1 ? 'notice' : 'notices'} — nothing new.`
      );
      if (data.flagged > 0) load();
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400" />
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
    <PageIn className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Who to call</h1>
          <p className="text-sm text-white/45 mt-1">
            {total === 0
              ? 'Nothing waiting on a call right now.'
              : `${total} ${total === 1 ? 'business' : 'businesses'} to ring, most urgent first. Work down the list.`}
          </p>
          {/* Every open lead falls into exactly one of these and the figures
              reconcile with the total, so the number is never a mystery. */}
          {meta && meta.totalOpen > 0 && (
            <button
              onClick={() => setShowBreakdown((v) => !v)}
              className="text-xs text-white/35 hover:text-white/60 mt-1.5 underline underline-offset-2 transition-colors"
            >
              {showBreakdown ? 'Hide' : 'Where does this number come from?'}
            </button>
          )}
        </div>
        <button
          onClick={syncBounces}
          disabled={syncing}
          className="shrink-0 flex items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 text-xs font-semibold hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Checking...' : 'Check for bounced emails'}
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
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            readyNow
              ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
              : 'border-white/15 text-white/55 hover:bg-white/5'
          }`}
        >
          {readyNow ? '✓ ' : ''}Sensible hour there ({readyCount})
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
            <a
              href={`tel:${nextUp.phone}`}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
            >
              <Phone size={14} /> Call {nextUp.company}
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

      {meta?.truncated && (
        <p className="text-xs text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-4">
          You have more open leads than this page loads at once. The most urgent are shown — clear some down and
          the rest will appear.
        </p>
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
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/admin/leads/${row.id}`} className="min-w-0 group">
                          <p className="text-sm font-bold text-white/90 group-hover:text-sky-300 transition-colors break-words">
                            {row.hotLead && <span className="text-amber-400">★ </span>}
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
                        <a
                          href={`tel:${row.phone}`}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-400/15 border border-emerald-400/30 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/25 transition-colors"
                        >
                          <Phone size={13} /> Call {row.phone}
                        </a>
                        <Link
                          href={`/admin/leads/${row.id}`}
                          className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/5 transition-colors"
                        >
                          Brief
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

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
    </PageIn>
  );
}
