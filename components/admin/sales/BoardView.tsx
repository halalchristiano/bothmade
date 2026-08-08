'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Flame, ExternalLink, Phone, Mail, CheckCircle2 } from 'lucide-react';
import {
  LEAD_STAGES,
  LEAD_STATUSES,
  LEAD_STATUS_SHORT_LABELS,
  stageForStatus,
  type LeadStatus,
} from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { SearchFilter, matchesSearch } from '@/components/admin/ui';
import { LostReasonModal } from '@/components/admin/LostReasonModal';
import { LogTouchPopover } from '@/components/admin/LogTouchPopover';
import { formatRelativeTime } from '@/components/admin/dashboard/RefreshIndicator';
import { useLeadStatusChange } from '@/components/admin/useLeadStatusChange';

interface LeadCard {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  estimatedValue: number | null;
  /** What the deal is actually worth — sold price, else quote, else the guess. */
  dealValue: number | null;
  dealValueIsFirm: boolean;
  hotLead: boolean;
  qualifiedAt: string | null;
  updatedAt: string;
  /** Last note, call, email or dial. Null for a lead nobody has worked yet. */
  lastActivityAt: string | null;
  assignedTo: { name: string | null } | null;
}

/**
 * How loudly a card admits it has gone quiet.
 *
 * Thresholds match the ones the rest of the app already uses to decide a lead
 * is going stale — five days on the dashboard's "Do This Next", and the
 * late-funnel checks at three. A card here is quieter than that by design:
 * this is a board somebody browses, not a list telling them what to do.
 */
function staleTone(lastActivityAt: string | null): string {
  if (!lastActivityAt) return 'text-white/30';
  const days = (Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000;
  if (days >= 14) return 'text-red-300/70';
  if (days >= 5) return 'text-amber-300/70';
  return 'text-white/30';
}

/** The full status order, which is still what a move steps through. */
const COLUMN_STATUSES: LeadStatus[] = [...LEAD_STATUSES];

const STAGE_ACCENT: Record<string, string> = {
  prospect: 'border-t-white/30',
  talking: 'border-t-sky-400/70',
  discovery: 'border-t-purple-400/70',
  pitching: 'border-t-pink-400/70',
  closing: 'border-t-amber-400/70',
  closed: 'border-t-emerald-400/60',
};

/**
 * The pipeline board — a view inside /admin/sales rather than its own
 * destination. Every lead by stage, for the moment the question is "where is
 * everything" rather than "who do I ring next".
 */
export function BoardView({ refreshToken = 0 }: { refreshToken?: number }) {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [hideClosedColumns, setHideClosedColumns] = useState(false);
  /*
   * Remembered, because it is a preference about how you read the board
   * rather than a filter you set for one look. Defaults to "worked": the
   * question it answers — what have I just done, and what has gone quiet — is
   * the one somebody has while the board is open.
   */
  const [order, setOrder] = useState<'worked' | 'pipeline'>('worked');

  useEffect(() => {
    try {
      if (localStorage.getItem('bothmade_board_order') === 'pipeline') setOrder('pipeline');
    } catch {
      /* private browsing — the default is fine */
    }
  }, []);

  const chooseOrder = (next: 'worked' | 'pipeline') => {
    setOrder(next);
    try {
      localStorage.setItem('bothmade_board_order', next);
    } catch {
      /* ignore */
    }
  };
  const reduceMotion = useReducedMotion();

  const load = async () => {
    try {
      const response = await fetch('/api/admin/leads');
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await response.json();
      if (data.success) setLeads(data.leads);
    } finally {
      setLoading(false);
    }
  };

  // refreshToken is bumped by the shell when a lead is added from the page
  // header, so a board sitting behind the modal picks the new row up.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  /*
   * Two ways to read a column, and they genuinely disagree.
   *
   * "Pipeline order" is how this board was built: within a stage, ordered by
   * exact status, so a column reads front-to-back like the pipeline it
   * represents. That is right for "where is everything".
   *
   * "Recently worked" is right for the other question — I just logged a call
   * on this one, where did it go. Under pipeline order it went nowhere
   * visible, because a stage holds several statuses and status wins: a
   * qualified lead can never rise above a contacted one in Talking, however
   * recently you touched it. Ties then fell through to whatever order the API
   * returned, which was `updatedAt` — bumped by any write at all, so a bulk
   * tag edit lifted leads nobody had spoken to.
   *
   * Sorted on the activity timeline instead, which is the actual record of
   * work. A lead with no activity sorts last rather than first: never touched
   * is not the same as touched longest ago, and it must not read as the most
   * recent thing you did.
   */
  const workedAt = (l: LeadCard) => (l.lastActivityAt ? new Date(l.lastActivityAt).getTime() : -Infinity);

  const columns = useMemo(() => {
    const grouped = Object.fromEntries(LEAD_STAGES.map((s) => [s.key, [] as LeadCard[]])) as Record<
      string,
      LeadCard[]
    >;
    for (const lead of leads) {
      if (!matchesSearch(search, lead.company, lead.contactName, lead.email, lead.phone, lead.assignedTo?.name)) {
        continue;
      }
      grouped[stageForStatus(lead.status).key]?.push(lead);
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => {
        if (order === 'worked') return workedAt(b) - workedAt(a);
        /*
         * Status first, then last worked.
         *
         * The tie-break used to be nothing at all: leads sharing a status kept
         * whatever order the API returned, which was `updatedAt desc` — bumped
         * by any write, so a bulk tag edit or an importer pass reshuffled the
         * column for reasons nobody did. Stating it fixes that, and makes the
         * two orders agree about what "recent" means.
         */
        const byStatus = COLUMN_STATUSES.indexOf(a.status) - COLUMN_STATUSES.indexOf(b.status);
        return byStatus !== 0 ? byStatus : workedAt(b) - workedAt(a);
      });
    }
    return grouped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, search, order]);

  const shownCount = useMemo(
    () => Object.values(columns).reduce((n, col) => n + col.length, 0),
    [columns]
  );

  // The optimistic move + rollback + "ask why" on lost is the same sequence
  // the leads list, spreadsheet and lead page run — one implementation now.
  const {
    changeStatus,
    lostTarget: pendingLostMove,
    confirmLost,
    cancelLost,
    error: moveError,
  } = useLeadStatusChange<LeadCard>({
    applyStatus: (lead, status) =>
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l))),
    onSavingChange: setMovingId,
  });

  const handleMove = (lead: LeadCard, direction: 1 | -1) => {
    const idx = COLUMN_STATUSES.indexOf(lead.status);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= COLUMN_STATUSES.length) return;
    changeStatus(lead, COLUMN_STATUSES[nextIdx]);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading the board…</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-white/40 mb-4">
        Every lead, by stage. Use the arrows to move a deal forward or back.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-1">
        <div className="flex-1">
          <SearchFilter
            value={search}
            onChange={setSearch}
            placeholder="Find a business on the board..."
            count={shownCount}
            total={leads.length}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-white/50 whitespace-nowrap cursor-pointer">
          <input
            type="checkbox"
            checked={hideClosedColumns}
            onChange={(e) => setHideClosedColumns(e.target.checked)}
          />
          Hide Won/Lost
        </label>

        {/*
          Which question the columns are answering. Named as questions rather
          than as sort keys, because "Recently worked" and "Pipeline order"
          are two different things to want from the same board and neither is
          more correct.
        */}
        <div
          role="group"
          aria-label="Order within each column"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-black/20 p-1"
        >
          {([
            ['worked', 'Recently worked'],
            ['pipeline', 'Pipeline order'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => chooseOrder(key)}
              aria-pressed={order === key}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                order === key ? 'bg-white/[0.09] text-white' : 'text-white/45 hover:text-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {moveError && (
        <p className="text-sm text-red-300 mb-3" role="alert">
          {moveError}
        </p>
      )}

      {/* Columns on a desktop, stacked sections on a phone. Six columns is
          two and a half screens wide on a laptop and simply the wrong shape
          on a handset — a board read sideways with one card visible is worse
          than a list. Same markup, different axis. */}
      <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-4">
        {LEAD_STAGES.filter((stage) => !hideClosedColumns || stage.key !== 'closed').map((stage) => {
          const columnLeads = columns[stage.key];
          const totalValue = columnLeads.reduce((s, l) => s + (l.dealValue || 0), 0);
          return (
            <div key={stage.key} className="w-full md:w-[17rem] md:flex-shrink-0">
              <div className={`rounded-2xl border-t-2 ${STAGE_ACCENT[stage.key]} bg-white/[0.03] border border-white/[0.07] p-3 h-full`}>
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className="text-sm font-semibold">{stage.label}</h2>
                  <span className="text-xs text-white/40">{columnLeads.length}</span>
                </div>
                <p className="text-[11px] text-white/25 px-1 leading-snug">{stage.hint}</p>
                <p className="text-xs text-white/40 px-1 mt-1 mb-3">
                  {totalValue > 0 ? formatCents(totalValue) : '\u00a0'}
                </p>

                <div className="space-y-2 md:min-h-[100px]">
                  {columnLeads.map((lead) => (
                    <motion.div
                      key={lead.id}
                      // Cards slide between columns as leads move — the one
                      // animation on this page that carries meaning, and the
                      // one most worth switching off when motion is reduced.
                      layout={!reduceMotion}
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                      animate={{ opacity: movingId === lead.id ? 0.5 : 1, scale: 1 }}
                      transition={reduceMotion ? { duration: 0 } : undefined}
                      className="rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 p-3 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <Link href={`/admin/leads/${lead.id}`} className="font-medium text-sm hover:underline flex items-center gap-1 min-w-0">
                          <span className="truncate">{lead.company}</span>
                          <ExternalLink size={11} className="opacity-0 group-hover:opacity-50 shrink-0" />
                        </Link>
                        <div className="flex items-center gap-1 shrink-0">
                          {lead.qualifiedAt && (
                            <CheckCircle2 size={12} className="text-emerald-400" aria-label="Qualified" />
                          )}
                          {lead.hotLead && <Flame size={13} className="text-amber-400" />}
                        </div>
                      </div>
                      {/* The column names the stage, so the card names the
                          exact status. Grouping the view must not cost anyone
                          the detail it was grouping. */}
                      <p className="text-[11px] text-white/50 mb-1">
                        {LEAD_STATUS_SHORT_LABELS[lead.status]}
                      </p>
                      <p className="text-xs text-white/40 mb-2">
                        {lead.dealValue ? formatCents(lead.dealValue) : '—'}
                        {lead.assignedTo?.name ? ` · ${lead.assignedTo.name}` : ''}
                      </p>
                      {/*
                        Says why the card is where it is — a row that moves for
                        a reason nobody can see reads as the board shuffling
                        itself — and, past a week, says the opposite thing.

                        Ordering by recency puts the leads nobody has touched
                        at the BOTTOM of the column, which is the one real cost
                        of reading the board this way. It does not have to also
                        make them invisible: a card that has gone quiet says so
                        in amber wherever it has sunk to, so scrolling a column
                        still turns up the ones being forgotten.
                      */}
                      {order === 'worked' && (
                        <p className={`text-[11px] mb-2 ${staleTone(lead.lastActivityAt)}`}>
                          {lead.lastActivityAt
                            ? `Worked ${formatRelativeTime(new Date(lead.lastActivityAt))}`
                            : 'Not worked yet'}
                        </p>
                      )}
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-0.5">
                          {/* Bounded by the card's own status, not the
                              column's — a stage holds several statuses now, so
                              the column can no longer say where a given lead
                              sits in the sequence. */}
                          <button
                            onClick={() => handleMove(lead, -1)}
                            disabled={COLUMN_STATUSES.indexOf(lead.status) === 0}
                            className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move back"
                          >
                            <ArrowLeft size={13} />
                          </button>
                          <button
                            onClick={() => handleMove(lead, 1)}
                            disabled={COLUMN_STATUSES.indexOf(lead.status) === COLUMN_STATUSES.length - 1}
                            className="p-1 rounded-lg hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move forward"
                          >
                            <ArrowRight size={13} />
                          </button>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} title="Call" aria-label={`Call ${lead.company}`} className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors">
                              <Phone size={12} />
                            </a>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} title="Email" aria-label={`Email ${lead.company}`} className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-sky-300 transition-colors">
                              <Mail size={12} />
                            </a>
                          )}
                          <LogTouchPopover leadId={lead.id} onLogged={load} />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {columnLeads.length === 0 && (
                    <p className="text-xs text-white/20 text-center py-6">Nothing here</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pendingLostMove && (
        <LostReasonModal companyName={pendingLostMove.company} onCancel={cancelLost} onConfirm={confirmLost} />
      )}
    </div>
  );
}
