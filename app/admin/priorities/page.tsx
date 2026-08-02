'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListChecks, Inbox, MessageCircle, AlertTriangle, DollarSign } from 'lucide-react';
import { PageIn, PageTitle, Card } from '@/components/admin/ui';

interface OpsStats {
  newHandoffs: Array<{ id: string; company: string; handoffAcknowledgedAt: string | null; daysWaiting: number }>;
  atRiskProjects: Array<{ id: string; name: string; company: string; daysSinceUpdate: number }>;
  overdueBalances: Array<{ id: string; name: string; company: string; balanceDue: number }>;
  projectsAwaitingReply: Array<{ id: string; name: string; company: string; waitHours: number }>;
}

type Band = 'handoff' | 'reply' | 'atrisk' | 'balance';

interface PriorityRow {
  id: string;
  band: Band;
  company: string;
  detail: string;
}

const BAND_META: Record<Band, { label: string; icon: typeof Inbox; classes: string }> = {
  handoff: {
    label: "New handoffs waiting to be picked up",
    icon: Inbox,
    classes: 'border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-200',
  },
  reply: {
    label: 'Clients waiting on a reply',
    icon: MessageCircle,
    classes: 'border-sky-400/30 bg-sky-400/[0.06] text-sky-200',
  },
  atrisk: {
    label: "Gone quiet — nobody's touched these in a week+",
    icon: AlertTriangle,
    classes: 'border-red-400/30 bg-red-400/[0.06] text-red-200',
  },
  balance: {
    label: 'Outstanding balances',
    icon: DollarSign,
    classes: 'border-amber-400/30 bg-amber-400/[0.06] text-amber-200',
  },
};

const BAND_ORDER: Band[] = ['handoff', 'reply', 'atrisk', 'balance'];

export default function PrioritiesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PriorityRow[] | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/ops-stats?range=quarter');
        if (res.status === 401) {
          router.push('/admin/login');
          return;
        }
        const data = await res.json();
        if (!data.success) return;
        const stats: OpsStats = data.stats;

        // Every project gets at most one row, in the band that matters most
        // right now — a project that's both quiet AND owes money isn't two
        // separate things to look at, it's one thing needing a call.
        const seen = new Set<string>();
        const out: PriorityRow[] = [];

        for (const h of stats.newHandoffs) {
          if (h.handoffAcknowledgedAt) continue;
          seen.add(h.id);
          out.push({
            id: h.id,
            band: 'handoff',
            company: h.company,
            detail: h.daysWaiting > 0 ? `Waiting ${h.daysWaiting}d — give them a first touch` : 'Just handed off',
          });
        }
        for (const p of stats.projectsAwaitingReply) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          const hours = p.waitHours;
          out.push({
            id: p.id,
            band: 'reply',
            company: p.company,
            detail: hours >= 24 ? `Waiting ${Math.floor(hours / 24)}d for a reply` : `Waiting ${hours}h for a reply`,
          });
        }
        for (const p of stats.atRiskProjects) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          out.push({
            id: p.id,
            band: 'atrisk',
            company: p.company,
            detail: `${p.daysSinceUpdate} days since anyone touched it`,
          });
        }
        for (const p of stats.overdueBalances) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          out.push({
            id: p.id,
            band: 'balance',
            company: p.company,
            detail: `$${(p.balanceDue / 100).toLocaleString()} outstanding`,
          });
        }
        setRows(out);
      } catch {
        setRows([]);
      }
    };
    load();
  }, [router]);

  if (rows === null) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400" />
      </div>
    );
  }

  const grouped = BAND_ORDER.map((band) => ({ band, rows: rows.filter((r) => r.band === band) })).filter(
    (g) => g.rows.length > 0
  );

  return (
    <PageIn className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <PageTitle icon={ListChecks} title="Priorities" />
      <p className="text-sm text-white/45 mt-1 mb-6">
        {rows.length === 0
          ? 'Nothing needs you right now.'
          : `${rows.length} ${rows.length === 1 ? 'project needs' : 'projects need'} attention, most urgent first.`}
      </p>

      {grouped.length === 0 ? (
        <Card className="p-12 text-center text-white/40">Everything's current. Nice.</Card>
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
                    <Link
                      key={row.id}
                      href={`/admin/projects/${row.id}`}
                      className="block rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 hover:bg-white/[0.05] transition-colors"
                    >
                      <p className="text-sm font-semibold text-white/90">{row.company}</p>
                      <p className="text-xs text-white/40 mt-0.5">{row.detail}</p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageIn>
  );
}
