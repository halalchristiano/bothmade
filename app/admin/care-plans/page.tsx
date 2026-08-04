'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecurringCarePanel } from '@/components/admin/RecurringCarePanel';
import { formatCents } from '@/lib/pricing';

interface CarePlanRow {
  id: string;
  name: string;
  company: string;
  status: string;
  statusStage: number;
  inScope: string[];
  inScopeLabel: string | null;
  monthlyPotential: number;
  offer: {
    id: string;
    planLabel: string;
    status: string;
    discountedCents: number;
    monthlyCents: number;
    standardRateFromMonth: number;
    paidToDate: number;
    paymentCount: number;
  } | null;
  updatedAt: string;
}

type Filter = 'to-sell' | 'out' | 'active' | 'all';

const FILTERS: Array<{ key: Filter; label: string; blurb: string }> = [
  {
    key: 'to-sell',
    label: 'Worth a call',
    blurb: 'Nothing offered yet, and far enough along that the plan makes sense to raise.',
  },
  { key: 'out', label: 'Offer out', blurb: 'Sent and waiting on them.' },
  { key: 'active', label: 'Running', blurb: 'Billing monthly.' },
  { key: 'all', label: 'Everything', blurb: 'Every live project.' },
];

/** Design and later — early enough to raise it, late enough for it to land. */
const READY_STAGE = 1;

const STATUS_STYLES: Record<string, string> = {
  sent: 'border-sky-400/40 bg-sky-400/10 text-sky-200',
  active: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  declined: 'border-white/15 bg-white/5 text-white/50',
  canceled: 'border-white/15 bg-white/5 text-white/50',
};

/**
 * The care-plan worklist — who to put on a monthly plan, and where each of
 * those conversations has got to.
 *
 * Deliberately its own page rather than a widget on the project list: the
 * project list is ops territory and hidden from a sales account, while this is
 * a sales job. Selling the ongoing plan at the end of a build is the one piece
 * of project work that belongs to whoever closed the deal.
 */
export default function CarePlansPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CarePlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('to-sell');
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/care-plans');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data.success) setRows(data.projects);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'out') return rows.filter((row) => row.offer?.status === 'sent');
    if (filter === 'active') return rows.filter((row) => row.offer?.status === 'active');
    return rows.filter(
      (row) =>
        row.statusStage >= READY_STAGE &&
        (!row.offer || row.offer.status === 'declined' || row.offer.status === 'canceled')
    );
  }, [rows, filter]);

  const monthlyRunRate = useMemo(
    () =>
      rows
        .filter((row) => row.offer?.status === 'active')
        .reduce((sum, row) => sum + (row.offer?.discountedCents ?? 0), 0),
    [rows]
  );

  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-8 py-6 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Care Plans</h1>
        <p className="text-sm text-white/40">
          The monthly services clients can be signed onto after the build — hosting, maintenance, a
          growth plan. Best raised while the project is still in front of them, at an introductory
          rate you set that reverts to the standard one after a year.
        </p>
        {monthlyRunRate > 0 && (
          <p className="mt-3 text-sm">
            <span className="text-white/40">Billing monthly right now: </span>
            <span className="font-semibold text-emerald-300">{formatCents(monthlyRunRate)}</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            onClick={() => setFilter(option.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              filter === option.key
                ? 'border-sky-400/50 bg-sky-400/10 text-sky-200'
                : 'border-white/10 text-white/50 hover:bg-white/5'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-white/30 mb-6">
        {FILTERS.find((option) => option.key === filter)?.blurb}
      </p>

      {loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-white/40">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const open = openProjectId === row.id;
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenProjectId(open ? null : row.id)}
                  className="w-full text-left px-5 py-4 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{row.company}</p>
                      <p className="text-xs text-white/40 truncate">
                        {row.name} · <span className="capitalize">{row.status}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {row.offer ? (
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            STATUS_STYLES[row.offer.status] || STATUS_STYLES.declined
                          }`}
                        >
                          {row.offer.status === 'active'
                            ? `${formatCents(row.offer.discountedCents)}/mo`
                            : row.offer.status === 'sent'
                              ? 'Offer out'
                              : row.offer.status === 'declined'
                                ? 'Withdrawn'
                                : 'Canceled'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-white/40">No offer yet</span>
                      )}
                      <span className="text-white/30 text-xs">{open ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-white/40">
                    {row.inScopeLabel
                      ? `Already in their scope: ${row.inScopeLabel} — ${formatCents(row.monthlyPotential)}/mo once the included months run out.`
                      : 'No ongoing services in the original scope — this would be a fresh sell.'}
                  </p>
                </button>

                {open && (
                  <div className="px-5 pb-5">
                    <RecurringCarePanel projectId={row.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
