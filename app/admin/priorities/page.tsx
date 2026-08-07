'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ListChecks,
  Inbox,
  MessageCircle,
  AlertTriangle,
  DollarSign,
  Rocket,
  Receipt,
  Clock,
  Undo2,
  PenLine,
} from 'lucide-react';
import { Card, Kicker, LoadError, PageIn, PageTitle } from '@/components/admin/ui';

/**
 * Priorities: the one list of work that needs a person today.
 *
 * Two things used to make it unreadable.
 *
 * The money band asked "how much of the contracted price is unpaid", which
 * since every project gained a three-instalment schedule is a number above
 * zero for the entire life of every job. So the band listed every live
 * project, permanently, and the correct response to it was to ignore it. It
 * now asks two narrower questions instead — see projectBalance() in
 * lib/billing.ts — and the more useful of the two is the new one: money past
 * its gate that nobody has invoiced. That is revenue sitting on the table,
 * and unlike a late client it is entirely ours to fix.
 *
 * And there was nothing to *do* here. Every row was a link out. A list of
 * problems with no way to say "seen it, not this week" only grows, so the
 * rows you couldn't act on today buried the ones you could. Snooze is the
 * whole answer, and it deliberately changes nothing about the underlying
 * project — see the snooze route.
 */

interface OpsStats {
  newHandoffs: Array<{ id: string; company: string; handoffAcknowledgedAt: string | null; daysWaiting: number }>;
  atRiskProjects: Array<{ id: string; name: string; company: string; daysSinceUpdate: number }>;
  overdueBalances: Array<{ id: string; name: string; company: string; balanceDue: number }>;
  unbilledInstalments: Array<{ id: string; name: string; company: string; unbilledCents: number }>;
  projectsAwaitingReply: Array<{ id: string; name: string; company: string; waitHours: number }>;
  readyToDeliver: Array<{ id: string; name: string; company: string; updatedAt: string }>;
  unreadDesignFeedback: Array<{
    id: string;
    projectId: string;
    name: string;
    company: string;
    round: number;
    daysWaiting: number;
  }>;
  snoozed: Array<{ id: string; company: string; until: string }>;
}

type Band = 'feedback' | 'unbilled' | 'deliver' | 'handoff' | 'reply' | 'balance' | 'atrisk';

interface PriorityRow {
  id: string;
  band: Band;
  company: string;
  detail: string;
}

const BAND_META: Record<Band, { label: string; icon: typeof Inbox; classes: string }> = {
  feedback: {
    label: 'Design feedback waiting to be read',
    icon: PenLine,
    classes: 'border-sky-400/40 bg-sky-400/[0.09] text-sky-100',
  },
  unbilled: {
    label: "Earned but never invoiced — send the payment",
    icon: Receipt,
    classes: 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200',
  },
  deliver: {
    label: 'Done but not delivered — set the live URL',
    icon: Rocket,
    classes: 'border-purple-400/30 bg-purple-400/[0.06] text-purple-200',
  },
  handoff: {
    label: 'New handoffs waiting to be picked up',
    icon: Inbox,
    classes: 'border-teal-400/30 bg-teal-400/[0.06] text-teal-200',
  },
  reply: {
    label: 'Clients waiting on a reply',
    icon: MessageCircle,
    classes: 'border-sky-400/30 bg-sky-400/[0.06] text-sky-200',
  },
  balance: {
    label: 'Invoiced and unpaid — chase it',
    icon: DollarSign,
    classes: 'border-amber-400/30 bg-amber-400/[0.06] text-amber-200',
  },
  atrisk: {
    label: "Gone quiet — nobody's touched these in a week+",
    icon: AlertTriangle,
    classes: 'border-red-400/30 bg-red-400/[0.06] text-red-200',
  },
};

/**
 * Most-actionable first: a client who has already done their part and
 * stopped, then money we control, then a client who is waiting.
 *
 * Design feedback outranks even the unbilled money. Everything below it is
 * something we can do whenever we get to it; this is a project that cannot
 * move at all — their review clock stopped when they hit send — with a
 * person on the other end wondering whether it arrived.
 */
const BAND_ORDER: Band[] = ['feedback', 'unbilled', 'deliver', 'handoff', 'reply', 'balance', 'atrisk'];

const money = (cents: number) => `$${(cents / 100).toLocaleString()}`;

const SNOOZE_CHOICES = [
  { days: 1, label: 'tomorrow' },
  { days: 3, label: '3 days' },
  { days: 7, label: 'a week' },
] as const;

function untilLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'later';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PrioritiesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PriorityRow[] | null>(null);
  const [snoozed, setSnoozed] = useState<OpsStats['snoozed']>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ops-stats?range=quarter');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.success) {
        /*
         * This used to be a bare `return`, leaving `rows` at its initial
         * null — which is the loading sentinel, so the page sat on
         * "Loading priorities…" for as long as anybody left it open. A
         * spinner that never resolves is the one failure state with no
         * recovery in it at all: nothing to read, nothing to press.
         */
        setFailed(true);
        setRows([]);
        return;
      }
      const stats: OpsStats = data.stats;

      // Every project gets at most one row, in the band that matters most
      // right now — a project that's both quiet AND owes money isn't two
      // separate things to look at, it's one thing needing a call.
      const seen = new Set<string>();
      const out: PriorityRow[] = [];
      const add = (id: string, band: Band, company: string, detail: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        out.push({ id, band, company, detail });
      };

      // A project can be both — an invoice out and unpaid, and a further
      // payment past its gate that was never sent. That is one project to
      // open, not two rows, but the row has to carry both facts or the
      // dedup quietly loses one of them.
      // Before the money, and before the dedup can bury it under a balance:
      // this is the only row where the client is waiting on us to read
      // something we asked them to write.
      const unread = stats.unreadDesignFeedback ?? [];
      const unreadPerProject = unread.reduce<Record<string, number>>((acc, f) => {
        acc[f.projectId] = (acc[f.projectId] ?? 0) + 1;
        return acc;
      }, {});
      // Newest-first from the API, so the row names the round we have to
      // build to. The backlog behind it still gets said out loud — three
      // unread rounds and a row that mentions one is a row that under-reports
      // how far behind the project is.
      for (const f of unread) {
        const behind = unreadPerProject[f.projectId] ?? 1;
        const age =
          f.daysWaiting > 0
            ? `sent ${f.daysWaiting}d ago and still unread`
            : 'just came in — nobody has read it';
        add(
          f.projectId,
          'feedback',
          f.company,
          behind > 1
            ? `${behind} rounds of feedback unread — the latest is round ${f.round}, ${age}`
            : `Round ${f.round} feedback, ${age}`
        );
      }

      const alsoOwed = new Map(stats.overdueBalances.map((p) => [p.id, p.balanceDue]));
      for (const p of stats.unbilledInstalments ?? []) {
        const owed = alsoOwed.get(p.id);
        add(
          p.id,
          'unbilled',
          p.company,
          owed
            ? `${money(p.unbilledCents)} payable and never invoiced — and ${money(owed)} already invoiced is still unpaid`
            : `${money(p.unbilledCents)} is payable and hasn't been invoiced`
        );
      }
      for (const p of stats.readyToDeliver) {
        // Points at the launch board rather than the project page now. "Add
        // the live URL" was the whole of what going live meant when this line
        // was written; the checks that stop it going wrong live on their own
        // screen, and that is where somebody should land.
        add(
          p.id,
          'deliver',
          p.company,
          `${p.name} is built and not live — check it off and ship it`
        );
      }
      for (const h of stats.newHandoffs) {
        if (h.handoffAcknowledgedAt) continue;
        add(
          h.id,
          'handoff',
          h.company,
          h.daysWaiting > 0 ? `Waiting ${h.daysWaiting}d — give them a first touch` : 'Just handed off'
        );
      }
      for (const p of stats.projectsAwaitingReply) {
        add(
          p.id,
          'reply',
          p.company,
          p.waitHours >= 24 ? `Waiting ${Math.floor(p.waitHours / 24)}d for a reply` : `Waiting ${p.waitHours}h for a reply`
        );
      }
      for (const p of stats.overdueBalances) {
        add(p.id, 'balance', p.company, `${money(p.balanceDue)} invoiced and still unpaid`);
      }
      for (const p of stats.atRiskProjects) {
        add(p.id, 'atrisk', p.company, `${p.daysSinceUpdate} days since anyone touched it`);
      }

      setRows(out);
      setSnoozed(stats.snoozed ?? []);
      setFailed(false);
    } catch {
      // An empty list here reads as "nothing needs you right now", which is a
      // sentence this page should only ever say when it knows it is true.
      setFailed(true);
      setRows([]);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  /** `days: null` undoes it. Optimistic either way — the list is the point. */
  const snooze = async (projectId: string, days: number | null) => {
    setBusyId(projectId);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/snooze`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) return;
      if (days === null) {
        setSnoozed((prev) => prev.filter((s) => s.id !== projectId));
        await load();
      } else {
        const moved = rows?.find((r) => r.id === projectId);
        setRows((prev) => prev?.filter((r) => r.id !== projectId) ?? prev);
        if (moved) {
          setSnoozed((prev) => [
            ...prev,
            { id: projectId, company: moved.company, until: new Date(Date.now() + days * 86_400_000).toISOString() },
          ]);
        }
      }
    } finally {
      setBusyId(null);
    }
  };

  if (rows === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading priorities…</p>
      </div>
    );
  }

  const grouped = BAND_ORDER.map((band) => ({ band, rows: rows.filter((r) => r.band === band) })).filter(
    (g) => g.rows.length > 0
  );

  return (
    <PageIn className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <Kicker className="mb-2">Delivery</Kicker>
      <PageTitle icon={ListChecks} title="Priorities" />
      <p className="text-sm text-white/45 mt-1 mb-6">
        {failed
          ? 'This list could not be loaded — it is not a quiet day, it is a failed request.'
          : rows.length === 0
          ? 'Nothing needs you right now.'
          : `${rows.length} ${rows.length === 1 ? 'project needs' : 'projects need'} attention, most urgent first.`}
      </p>

      {failed && (
        <div className="mb-4">
          <LoadError what="the priority list" onRetry={load} />
        </div>
      )}

      {failed ? null : grouped.length === 0 ? (
        <Card className="p-12 text-center text-white/40">Everything&apos;s current. Nice.</Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ band, rows: bandRows }) => {
            const meta = BAND_META[band];
            const Icon = meta.icon;
            return (
              <section key={band}>
                <div className={`rounded-xl border px-3.5 py-2.5 mb-3 ${meta.classes}`}>
                  <p className="text-sm font-bold flex items-center gap-1.5">
                    <Icon size={14} /> {meta.label}
                    <span className="ml-1 opacity-60">({bandRows.length})</span>
                  </p>
                </div>
                <div className="space-y-2">
                  {bandRows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 transition-colors hover:bg-white/[0.04]"
                    >
                      <Link
                        href={
                          row.band === 'deliver'
                            ? `/admin/deployment/${row.id}`
                            : `/admin/projects/${row.id}`
                        }
                        className="block"
                      >
                        <p className="text-sm font-semibold text-white/90">{row.company}</p>
                        <p className="text-xs text-white/40 mt-0.5">{row.detail}</p>
                      </Link>
                      {/* The reason this page is worth opening twice: a row you
                          can't act on today can be put down without pretending
                          it's finished. */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-2.5">
                        <span className="text-[11px] text-white/30">Not today —</span>
                        {SNOOZE_CHOICES.map((choice) => (
                          <button
                            key={choice.days}
                            onClick={() => snooze(row.id, choice.days)}
                            disabled={busyId === row.id}
                            className="rounded-lg px-2 py-1 text-[11px] font-medium text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/80 disabled:opacity-40"
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Snoozed rows are named, not silently dropped. A list that hides
          things without saying so is a list you stop trusting. */}
      {snoozed.length > 0 && (
        <section className="mt-10 border-t border-white/[0.07] pt-6">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/30">
            <Clock size={13} /> Snoozed ({snoozed.length})
          </p>
          <div className="space-y-1.5">
            {snoozed.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2"
              >
                <Link href={`/admin/projects/${s.id}`} className="text-xs text-white/50 hover:text-white/80">
                  {s.company}
                  <span className="ml-2 text-white/25">back on {untilLabel(s.until)}</span>
                </Link>
                <button
                  onClick={() => snooze(s.id, null)}
                  disabled={busyId === s.id}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/[0.07] hover:text-white/80 disabled:opacity-40"
                >
                  <Undo2 size={11} /> Bring back
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </PageIn>
  );
}
