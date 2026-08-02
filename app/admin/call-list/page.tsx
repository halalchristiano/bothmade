'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Phone, MailX, Clock, CalendarClock, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { PageIn } from '@/components/admin/ui';
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';
import { leadLocalTime } from '@/lib/local-time';
import { formatCents } from '@/lib/pricing';

type CallReason = 'bounced' | 'overdue' | 'today' | 'no-follow-up' | 'never-contacted';

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
};

const ORDER: CallReason[] = ['bounced', 'overdue', 'today', 'no-follow-up', 'never-contacted'];

export default function CallListPage() {
  const router = useRouter();
  const [callable, setCallable] = useState<CallRow[]>([]);
  const [noPhone, setNoPhone] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
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

  const grouped = ORDER.map((r) => ({ reason: r, rows: callable.filter((c) => c.reason === r) })).filter(
    (g) => g.rows.length > 0
  );
  const total = callable.length;

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

      {syncMessage && (
        <p className="text-xs text-sky-300 bg-sky-400/10 border border-sky-400/20 rounded-lg px-3 py-2 mt-3">
          {syncMessage}
        </p>
      )}

      {total === 0 && noPhone.length === 0 && (
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
              <div className={`rounded-xl border px-3.5 py-2.5 mb-3 ${meta.classes}`}>
                <p className="text-sm font-bold flex items-center gap-1.5">
                  {reason === 'bounced' && <MailX size={14} />}
                  {reason === 'overdue' && <AlertTriangle size={14} />}
                  {meta.label}
                  <span className="ml-1 opacity-60 font-semibold">({rows.length})</span>
                </p>
                <p className="text-xs opacity-70 mt-0.5 leading-relaxed">{meta.blurb}</p>
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

      {noPhone.length > 0 && (
        <section className="mt-8">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 mb-3">
            <p className="text-sm font-bold text-white/70 flex items-center gap-1.5">
              <CalendarClock size={14} /> No phone number on file
              <span className="ml-1 opacity-60">({noPhone.length})</span>
            </p>
            <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
              These are due a contact but there is nothing to ring. Find a number, or email them instead.
            </p>
          </div>
          <div className="space-y-2">
            {noPhone.map((row) => (
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
