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
  Eye,
  PhoneOff,
} from 'lucide-react';
import { SearchFilter, matchesSearch, Badge } from '@/components/admin/ui';
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads';
import { leadLocalTime } from '@/lib/local-time';
import { formatCents } from '@/lib/pricing';
import { CALL_OUTCOMES } from '@/lib/call-outcomes';
import { localDayStartParam } from '@/lib/day-window';

type CallReason =
  | 'replied'
  | 'mockup-sent'
  | 'opened'
  | 'bounced'
  | 'overdue'
  | 'today'
  | 'no-follow-up'
  | 'never-contacted'
  | 'awaiting-mockup'
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
  industry: string | null;
  region: string | null;
  /** Calls actually logged against this lead, ever. Not "activities". */
  timesCalled: number;
  nextFollowUpAt: string | null;
  emailDeliveryFailedReason: string | null;
  salesNote: string | null;
  reason: CallReason;
  /** Cold-email opens, as recorded. See lib/lead-opens.ts. */
  opens: number;
  openBand: 'silent' | 'delivered' | 'engaged' | 'hot';
  openHeadline: string;
  openNextStep: string | null;
  assignedTo: { name: string | null } | null;
  lastActivity: { type: string; content: string; createdAt: string } | null;
  /**
   * What happens to this lead next, in one sentence, decided on the server.
   *
   * The list was never the stressful part — not being able to tell whether a
   * lead was handled was. Four separate facts answer that and they used to
   * live in four places, so the only honest way to know was to open the lead.
   * See lib/next-touch.ts.
   */
  nextTouch?: { kind: string; line: string; needsAttention: boolean } | null;
  /**
   * Who rang this last, and when. Null if nobody ever has.
   *
   * The sheet is one shared list now, which is the point — and it means two
   * people can be looking at the same lead at the top of it and dial it
   * within the same ten minutes. `byYou` matters because "you rang this an
   * hour ago" and "Kiana rang this an hour ago" call for completely different
   * behaviour.
   */
  lastCall?: { at: string; byName: string; byYou: boolean } | null;
  /** Rung four times or more and never actually reached. */
  neverReached?: boolean;
}

const REASONS: Record<CallReason, { label: string; short: string; blurb: string; classes: string }> = {
  replied: {
    label: 'They wrote back',
    short: 'Replied',
    blurb:
      'Someone at these businesses answered your email. Warmest leads you have, and they go cold fastest — call them before anything else on this page.',
    classes: 'border-emerald-400/40 bg-emerald-400/[0.12] text-emerald-100',
  },
  'mockup-sent': {
    label: 'They have the mockup and nobody has rung',
    short: 'Mockup sent',
    blurb:
      'We built something, sent it, and nobody has picked up the phone since. The most valuable call on this page: the work is done and the only thing left is asking what they thought. Drops off this band the moment you log a call.',
    classes: 'border-teal-400/40 bg-teal-400/[0.12] text-teal-100',
  },
  opened: {
    label: 'They opened your email',
    short: 'Opened it',
    blurb:
      'Opened your cold email and did not write back. Most-opened first: anyone who came back to it is at the very top, and that is a person. Lower down are the ones opened once, which may have been their mail server — that still proves the address is live, and is still worth the call.',
    classes: 'border-orange-400/40 bg-orange-400/[0.12] text-orange-100',
  },
  bounced: {
    label: 'Their email is dead — phone is the only way in',
    short: 'Email bounced',
    blurb: 'These addresses bounced. Nothing you send will arrive, so the phone is the only route left.',
    classes: 'border-red-400/30 bg-red-400/[0.07] text-red-200',
  },
  overdue: {
    label: 'You said you would call, and the date has passed',
    short: 'Overdue',
    blurb: 'You promised these people a follow-up and the day went by. A broken promise is the fastest way to lose a warm lead.',
    classes: 'border-amber-400/30 bg-amber-400/[0.07] text-amber-200',
  },
  today: {
    label: 'You said you would call today',
    short: 'Due today',
    blurb: 'Booked in for today.',
    classes: 'border-sky-400/30 bg-sky-400/[0.07] text-sky-200',
  },
  'no-follow-up': {
    label: 'Reached out once, then nothing was booked',
    short: 'No next step',
    blurb:
      'You emailed or rang these at some point and no next date was ever set, so nothing will bring them back up on its own. This is the pile that quietly rots.',
    classes: 'border-purple-400/25 bg-purple-400/[0.06] text-purple-200',
  },
  'never-contacted': {
    label: 'Nobody has ever contacted these',
    short: 'Never contacted',
    blurb:
      'No email sent, no call logged, nothing. Straight off an import and untouched — the only band on this page where you are starting from scratch.',
    classes: 'border-white/15 bg-white/[0.04] text-white/70',
  },
  'awaiting-mockup': {
    label: 'Waiting on a mockup from us',
    short: 'Mockup being built',
    blurb:
      "Someone asked for a mockup for these and it has not gone out yet. Deliberately off today's list — you promised them something and it is not ready, so there is nothing to say until it is. They come back to the top the day it is sent.",
    classes: 'border-white/15 bg-white/[0.04] text-white/70',
  },
  scheduled: {
    label: 'Booked for a later date',
    short: 'Booked for later',
    blurb: "Not on today's list — they have a follow-up date in the future.",
    classes: 'border-white/15 bg-white/[0.04] text-white/70',
  },
};

/**
 * Deal-size bands, in dollars.
 *
 * Chosen off what the pipeline actually contains rather than round numbers
 * for their own sake: most rows sit between $8k and $22k, so bands at 5, 10
 * and 20 split the book into thirds instead of leaving two of them empty.
 */
const VALUE_BANDS = [
  { min: 0, label: 'Any' },
  { min: 5000, label: '$5k+' },
  { min: 10000, label: '$10k+' },
  { min: 20000, label: '$20k+' },
];

/**
 * Open-count bands. One open is deliberately offered even though one open is
 * weak evidence — a rep who wants to work everything that showed any sign at
 * all should be able to, and the number beside it is the honest count.
 */
const OPEN_BANDS = [
  { min: 0, label: 'Any' },
  { min: 1, label: '1+' },
  { min: 2, label: '2+' },
  { min: 3, label: '3+' },
  { min: 5, label: '5+' },
];

/**
 * The bands that start expanded.
 *
 * Each is evidence from the last day or two that goes cold fast, and each is
 * short — which is the test: a band earns being open if you would act on it
 * before you finished scrolling past it.
 */
const OPEN_BY_DEFAULT = new Set<CallReason>(['replied', 'mockup-sent', 'opened']);

const ORDER: CallReason[] = [
  'replied',
  'mockup-sent',
  'opened',
  'bounced',
  'overdue',
  'today',
  'no-follow-up',
  'never-contacted',
];

/**
 * Numbers dialled and not yet logged, kept across a reload.
 *
 * On a phone the dialler backgrounds the browser, and a rep working down the
 * sheet taps Dial several times before coming back to log anything. This was
 * a single overwritten entry, which meant every dial silently threw away the
 * prompt for the one before it — an afternoon of calls arriving in the
 * database as one.
 */
const PENDING_CALLS_KEY = 'pendingCalls';

/**
 * How many unlogged dials are remembered.
 *
 * Past a handful this stops being a memory aid and becomes a backlog nobody
 * will work through, and the oldest of them are the ones whose details have
 * already gone. Dropping the eldest is honest: the prompt is for calls you
 * can still remember.
 */
const MAX_PENDING_CALLS = 12;

/** Anything unreadable means no prompt, never a crash on a work queue. */
function readPendingCalls(): { id: string; company: string; at: number }[] {
  try {
    const raw = sessionStorage.getItem(PENDING_CALLS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed;
    // The single-entry shape this replaced. Carried over rather than dropped,
    // so upgrading mid-afternoon doesn't lose the call in progress.
    if (parsed && typeof parsed === 'object' && parsed.id) return [parsed];
  } catch {
    /* a corrupt entry just means no prompt */
  }
  return [];
}

function writePendingCalls(calls: { id: string; company: string; at: number }[]): void {
  try {
    if (calls.length === 0) sessionStorage.removeItem(PENDING_CALLS_KEY);
    else sessionStorage.setItem(PENDING_CALLS_KEY, JSON.stringify(calls));
  } catch {
    /* private mode — the prompt just won't survive a reload */
  }
}

/**
 * How long a call stays worth warning about.
 *
 * Short enough that the warning means "somebody may still be on the phone to
 * them", long enough to cover a rep who wandered off mid-list. Past this the
 * fact is still shown, just without the alarm — a permanent red flag on every
 * lead rung this month is a flag nobody reads.
 */
const COLLISION_WINDOW_MS = 3 * 60 * 60 * 1000;

/** "11 minutes ago", "3 hours ago", "yesterday". */
function agoWords(iso: string, now: number): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** The things a row can be filtered on. Named so a count can exclude its own. */
type FilterKey = 'value' | 'opens' | 'industry' | 'region' | 'untried';

/**
 * One set of filters, owned by whoever calls this.
 *
 * A hook rather than component state because there are now two lists that
 * each need their own: the call sheet, and the far bigger pile of leads that
 * were emailed and never opened. Sharing one set meant narrowing the sheet to
 * $20k+ dentists silently narrowed the unopened list too, and widening it to
 * dig through the unopened pile threw away the sheet you had set up. They ask
 * different questions and now answer them separately.
 */
function useRowFilters() {
  const [minValue, setMinValue] = useState(0);
  const [minOpens, setMinOpens] = useState(0);
  const [industry, setIndustry] = useState('');
  const [region, setRegion] = useState('');
  const [untried, setUntried] = useState(false);

  const test: Record<FilterKey, (r: CallRow) => boolean> = {
    value: (r) => (r.estimatedValue ?? 0) >= minValue * 100,
    opens: (r) => r.opens >= minOpens,
    industry: (r) => !industry || r.industry === industry,
    region: (r) => !region || r.region === region,
    untried: (r) => !untried || r.timesCalled === 0,
  };
  const KEYS = Object.keys(test) as FilterKey[];

  /*
   * Every filter except one. This is what makes the number beside each option
   * mean something: "$20k+ (14)" has to be the count you would get by
   * clicking it, with whatever else is already on still applied — not the
   * count across the whole book, which is a different and useless number.
   */
  const matchesExcept = (r: CallRow, except?: FilterKey) =>
    KEYS.every((k) => k === except || test[k](r));

  return {
    minValue,
    setMinValue,
    minOpens,
    setMinOpens,
    industry,
    setIndustry,
    region,
    setRegion,
    untried,
    setUntried,
    matches: (r: CallRow) => matchesExcept(r),
    matchesExcept,
    on: minValue > 0 || minOpens > 0 || !!industry || !!region || untried,
    clear: () => {
      setMinValue(0);
      setMinOpens(0);
      setIndustry('');
      setRegion('');
      setUntried(false);
    },
  };
}

type RowFilters = ReturnType<typeof useRowFilters>;

/** Options for a select, biggest group first, counted against the other filters. */
function groupCounts(
  rows: CallRow[],
  f: RowFilters,
  key: FilterKey,
  pick: (r: CallRow) => string | null
): Array<[string, number]> {
  return Object.entries(
    rows
      .filter((r) => f.matchesExcept(r, key))
      .reduce<Record<string, number>>((acc, r) => {
        const v = pick(r);
        if (v) acc[v] = (acc[v] ?? 0) + 1;
        return acc;
      }, {})
  ).sort((a, b) => b[1] - a[1]);
}

/**
 * Worth how much · read it how often · what trade · where · tried yet.
 *
 * `rows` is the list this bar filters, already narrowed by the search box, so
 * the counts move with the search too. `showOpens` is off for the unopened
 * pile, where every row has nought opens by definition and a band of open
 * counts would be five buttons that all say the same thing.
 */
function FilterBar({
  rows,
  f,
  showOpens = true,
  compact = false,
  testId,
}: {
  rows: CallRow[];
  f: RowFilters;
  showOpens?: boolean;
  compact?: boolean;
  /** Which of the two bars this is — the lists are otherwise identical. */
  testId: string;
}) {
  const trades = groupCounts(rows, f, 'industry', (r) => r.industry);
  const regions = groupCounts(rows, f, 'region', (r) => r.region);
  const untriedCount = rows.filter((r) => f.matchesExcept(r, 'untried') && r.timesCalled === 0).length;

  const pill = (active: boolean, tone: 'emerald' | 'amber' | 'sky') =>
    `rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-30 ${
      active
        ? tone === 'emerald'
          ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
          : tone === 'amber'
            ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
            : 'border-sky-400/40 bg-sky-400/15 text-sky-200'
        : 'border-white/12 text-white/50 hover:bg-white/5'
    }`;

  const label = 'text-[11px] uppercase tracking-wide text-white/35 mr-0.5';
  const select =
    'rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/60 focus:outline-none focus:ring-2 focus:ring-sky-400/50';

  return (
    <div
      data-testid={testId}
      className={`rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-3 ${
        compact ? 'mb-3' : 'mb-4'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={label}>Worth</span>
          {VALUE_BANDS.map((band) => {
            const n = rows.filter(
              (r) => f.matchesExcept(r, 'value') && (r.estimatedValue ?? 0) >= band.min * 100
            ).length;
            return (
              <button
                key={band.min}
                onClick={() => f.setMinValue(band.min)}
                disabled={n === 0 && band.min > 0}
                className={pill(f.minValue === band.min, 'emerald')}
              >
                {band.label} <span className="opacity-55">({n})</span>
              </button>
            );
          })}
        </div>

        {showOpens && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={label}>Opened</span>
            {OPEN_BANDS.map((band) => {
              const n = rows.filter((r) => f.matchesExcept(r, 'opens') && r.opens >= band.min).length;
              return (
                <button
                  key={band.min}
                  onClick={() => f.setMinOpens(band.min)}
                  disabled={n === 0 && band.min > 0}
                  title={
                    band.min === 0
                      ? 'Everyone on the sheet'
                      : `Opened your email at least ${band.min} ${band.min === 1 ? 'time' : 'times'}`
                  }
                  className={`inline-flex items-center gap-1 ${pill(f.minOpens === band.min, 'amber')}`}
                >
                  {band.min > 0 && <Eye size={10} />}
                  {band.label} <span className="opacity-55">({n})</span>
                </button>
              );
            })}
          </div>
        )}

        {trades.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className={label}>Trade</span>
            <select
              aria-label="Trade"
              value={f.industry}
              onChange={(e) => f.setIndustry(e.target.value)}
              className={select}
            >
              <option value="" className="bg-raised">
                Every trade ({trades.reduce((n, [, c]) => n + c, 0)})
              </option>
              {trades.map(([name, count]) => (
                <option key={name} value={name} className="bg-raised">
                  {name} ({count})
                </option>
              ))}
            </select>
          </div>
        )}

        {regions.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className={label}>State</span>
            <select
              aria-label="State"
              value={f.region}
              onChange={(e) => f.setRegion(e.target.value)}
              className={select}
            >
              <option value="" className="bg-raised">
                Everywhere ({regions.reduce((n, [, c]) => n + c, 0)})
              </option>
              {regions.map(([name, count]) => (
                <option key={name} value={name} className="bg-raised">
                  {name} ({count})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* The pile that quietly grows: emailed, listed, never actually rung. */}
        {untriedCount > 0 && (
          <button
            onClick={() => f.setUntried(!f.untried)}
            title="Nobody has logged a call against these — not one attempt"
            className={`inline-flex items-center gap-1 ${pill(f.untried, 'sky')}`}
          >
            <PhoneOff size={11} />
            Never rung <span className="opacity-55">({untriedCount})</span>
          </button>
        )}

        {f.on && (
          <button
            onClick={f.clear}
            className="ml-auto text-xs font-semibold text-white/40 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/** Same semantics as REASONS[...].classes, expressed as Badge tones for the per-row chip. */
const REASON_TONE: Record<CallReason, 'emerald' | 'red' | 'amber' | 'sky' | 'purple' | 'neutral'> = {
  replied: 'emerald',
  // Same green as a reply: both mean the lead has moved and is warm, which is
  // the only thing the chip colour is for.
  'mockup-sent': 'emerald',
  // Amber rather than a colour of its own: the Badge palette has five tones
  // and inventing a sixth for one band is how a UI stops meaning anything.
  opened: 'amber',
  bounced: 'red',
  overdue: 'amber',
  today: 'sky',
  'no-follow-up': 'purple',
  'never-contacted': 'neutral',
  'awaiting-mockup': 'neutral',
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
  /** Emailed, never opened by a person. Deliberately not on the sheet. */
  const [noSignal, setNoSignal] = useState<CallRow[]>([]);
  const [showNoSignal, setShowNoSignal] = useState(false);
  const [scheduledHot, setScheduledHot] = useState<CallRow[]>([]);
  const [meta, setMeta] = useState<{
    totalOpen: number;
    callsToday: number;
    breakdown: Partial<Record<CallReason, number>>;
    noPhoneCount: number;
    /** Held back, and why. Reported so an empty-looking sheet is believable. */
    awaitingMockup: number;
    scheduledLater: number;
    autoEmailsThisWeek: number;
    truncated: boolean;
    gmailStatus: 'ok' | 'needs-reconnect' | 'not-connected';
    googleOAuthAvailable: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  /*
   * The three questions a rep actually asks of a call list, as filters.
   *
   * "Only the big ones today." "Who is actually reading my emails?" "Give me
   * a morning of dentists so I can say the same thing twenty times." Each one
   * was previously answered by scrolling and remembering, which is the same
   * as not being answered.
   *
   * Every option carries its own count, so the filter row doubles as the
   * answer to how many there are before anything is clicked.
   */
  const f = useRowFilters();
  /*
   * The unopened pile gets its own set, on purpose.
   *
   * Digging through it is a different job from working the call sheet: you go
   * in to find out whether a send landed at all, and to pull the few big ones
   * out by hand. You want to do that WITHOUT disturbing the sheet you had
   * already set up — and with one shared set of filters each of those two
   * jobs undid the other.
   */
  const nf = useRowFilters();
  // Choosing controls. The list knows the right order; these let a rep pick a
  // business to actually ring now — which the order alone can't, because the
  // most urgent lead is often one where it's the middle of the night.
  const [showBreakdown, setShowBreakdown] = useState(false);
  /*
   * Which bands are open.
   *
   * Only the ones worth acting on this minute start open — a reply and an
   * open are both short lists and both decay in days. Everything else is a
   * pile you work through deliberately, and having all seven expanded meant a
   * page nobody could reach the bottom of.
   *
   * Stored as the set of bands whose state differs from that default, so a
   * band added later gets a sensible default rather than inheriting whatever
   * was in somebody's browser last year.
   */
  const [flippedBands, setFlippedBands] = useState<Set<CallReason>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('bothmade_call_list_bands');
      return new Set(raw ? (JSON.parse(raw) as CallReason[]) : []);
    } catch {
      return new Set();
    }
  });
  const isBandOpen = (reason: CallReason) =>
    OPEN_BY_DEFAULT.has(reason) !== flippedBands.has(reason);
  const toggleBand = (reason: CallReason) =>
    setFlippedBands((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      try {
        localStorage.setItem('bothmade_call_list_bands', JSON.stringify([...next]));
      } catch {
        /* a browser refusing storage is not a reason to refuse the click */
      }
      return next;
    });
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
  /*
   * Every number dialled and not yet logged, oldest first.
   *
   * This used to be a single entry in sessionStorage, overwritten on every
   * dial. Working down the sheet — tap Dial, talk, come back, tap the next
   * one — silently erased the previous prompt each time, so an afternoon of
   * calls produced one logged outcome and a dashboard that read "1 call
   * logged today". The rep had done the work; the app had thrown away every
   * record of it but the last.
   *
   * A list, kept in the order they were rung, so nothing dialled can be lost
   * by dialling the next one.
   */
  const [pendingCalls, setPendingCalls] = useState<
    { id: string; company: string; at: number }[]
  >([]);
  const pendingCall = pendingCalls[0] ?? null;
  const [savingQuick, setSavingQuick] = useState(false);
  const [quickOutcomeError, setQuickOutcomeError] = useState('');
  /**
   * The follow-on question after a call where somebody picked up.
   *
   * Separate from `pendingCall` because it outlives it: the call is logged
   * and gone from the queue, and this is the one thing still worth asking
   * about it. Answering "no" is not a no-op with nothing behind it — logging
   * the call already booked the automated email, so the card says which date
   * rather than pretending a button did something.
   */
  const [mockupAsk, setMockupAsk] = useState<{
    leadId: string;
    company: string;
    dueAt: string | null;
  } | null>(null);
  const [mockupSaving, setMockupSaving] = useState(false);
  const [mockupDone, setMockupDone] = useState<string | null>(null);
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
      // The browser's midnight, so "calls logged today" counts the rep's day
      // rather than the server's UTC one. See lib/day-window.ts.
      const res = await fetch(
        `/api/admin/leads/call-list?dayStart=${encodeURIComponent(localDayStartParam())}`
      );
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCallable(data.callable);
        setNoPhone(data.noPhone);
        setNoSignal(data.noSignal || []);
        setScheduledHot(data.scheduledHot ?? []);
        setMeta({
          totalOpen: data.totalOpen ?? 0,
          callsToday: data.callsToday ?? 0,
          breakdown: data.breakdown ?? {},
          noPhoneCount: data.noPhoneCount ?? 0,
          awaitingMockup: data.awaitingMockup ?? 0,
          scheduledLater: data.scheduledLater ?? 0,
          autoEmailsThisWeek: data.autoEmailsThisWeek ?? 0,
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
    setPendingCalls(readPendingCalls());
    const onVisible = () => {
      if (document.visibilityState === 'visible') setPendingCalls(readPendingCalls());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  /**
   * Tells the server a number was dialled, as it is dialled.
   *
   * `keepalive` is the whole trick. The phone app is about to take the screen
   * and the page may be frozen or discarded a moment later; an ordinary fetch
   * would be cancelled mid-flight and the dial would go unrecorded exactly
   * when it mattered. This is the one measurement in the system nobody has to
   * remember to take, so it has to survive the thing that happens next.
   */
  const recordDial = (leadId: string) => {
    try {
      fetch(`/api/admin/leads/${leadId}/dial`, { method: 'POST', keepalive: true }).catch(
        () => {}
      );
    } catch {
      /* a measurement that fails must never look like a call that failed */
    }
  };

  const startCall = (row: CallRow, dialled = false) => {
    if (dialled) recordDial(row.id);
    setQuickOutcomeError('');
    setPendingCalls((prev) => {
      // Re-dialling the same business is the same unlogged call, not a second
      // one — otherwise a number that rang out twice asks to be logged twice.
      const next = [
        ...prev.filter((p) => p.id !== row.id),
        { id: row.id, company: row.company, at: Date.now() },
      ].slice(-MAX_PENDING_CALLS);
      writePendingCalls(next);
      return next;
    });
  };

  /** Takes one off the pile — logged, or explicitly dismissed. */
  const clearPendingCall = (id?: string) => {
    setPendingCalls((prev) => {
      const target = id ?? prev[0]?.id;
      const next = prev.filter((p) => p.id !== target);
      writePendingCalls(next);
      return next;
    });
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
        const data = await res.json().catch(() => ({}));
        /*
         * The call is logged either way. If somebody was actually spoken to,
         * the card stays up for one more question instead of clearing —
         * asking now is the difference between a mockup request that happens
         * and one that gets remembered this evening.
         */
        if (data.askAboutMockup) {
          setMockupAsk({ leadId: pendingCall.id, company: pendingCall.company, dueAt: data.autoFollowUpDueAt ?? null });
        }
        clearPendingCall(pendingCall.id);
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

  /**
   * Yes puts them on the build queue and cancels the automated email — the
   * mockup IS the follow-up. No changes nothing, because logging the call
   * already booked it; the confirmation says when, so "No" reads as a
   * decision rather than a dismissal.
   */
  const answerMockup = async (wanted: boolean) => {
    if (!mockupAsk) return;
    if (!wanted) {
      setMockupDone(
        mockupAsk.dueAt
          ? `${mockupAsk.company} stays in the follow-up sequence — one email goes out on ${new Date(mockupAsk.dueAt).toLocaleDateString()}.`
          : `Noted for ${mockupAsk.company}.`
      );
      setMockupAsk(null);
      return;
    }
    setMockupSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${mockupAsk.leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupRequested: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setQuickOutcomeError(data.error || "Couldn't put the mockup request in — try it from their page.");
        return;
      }
      setMockupDone(
        `${mockupAsk.company} is on the build queue — off the call sheet until it goes out, then back at the top.`
      );
      setMockupAsk(null);
      load();
    } catch {
      setQuickOutcomeError("Couldn't put the mockup request in — try it from their page.");
    } finally {
      setMockupSaving(false);
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

  // Searched first, so every count in the filter bar moves with the search
  // box too rather than describing a list that isn't on screen.
  const searchedCallable = callable.filter(match);
  const searched = searchedCallable.filter(f.matches);
  const readyCount = searched.filter(callableNow).length;
  const visible = readyNow ? searched.filter(callableNow) : searched;
  // Counted after every filter, so the nudge below never offers to reorder
  // leads that are not on screen to begin with.
  const openedInView = visible.filter((r) => r.reason === 'opened').length;

  // The same filters, or the header count says one thing and the list shows
  // another the moment a trade is picked.
  const visibleNoPhone = noPhone.filter((r) => match(r) && f.matches(r));
  /*
   * Reading your email, and no number to ring.
   *
   * The alert email promises the call sheet — and the call sheet is built from
   * leads that have a phone number, so these landed at the very bottom of the
   * page under a heading about missing numbers, which is not where anybody was
   * told to look. They are still not callable, so they do not join the sheet;
   * what changes is that the section says so and sorts above the pile nobody
   * has opened.
   */
  const readingNoPhone = visibleNoPhone.filter((r) => r.reason === 'opened');
  const searchedNoSignal = noSignal.filter(match);
  const visibleNoSignal = searchedNoSignal.filter(nf.matches);
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

      {/*
          The setting that quietly undoes the ordering.

          Sorting by deal size or by hour is a deliberate override — it drops
          the bands entirely and returns one flat list — and it is remembered
          across sessions. So a choice made once, weeks ago, keeps scattering
          the leads who opened your email through the middle of the page, and
          nothing on screen said why. Only shown when it is actually costing
          something: a non-urgent sort AND somebody who has opened it.
      */}
      {sortBy !== 'urgent' && openedInView > 0 && (
        <p className="-mt-1 mb-2 text-xs text-amber-200/70">
          {openedInView} {openedInView === 1 ? 'lead has' : 'leads have'} opened your email.{' '}
          <button
            onClick={() => setSortBy('urgent')}
            className="font-semibold underline underline-offset-2 hover:text-white transition-colors"
          >
            Sort by most urgent
          </button>{' '}
          to put {openedInView === 1 ? 'it' : 'them'} at the top — this sort spreads them through the list.
        </p>
      )}

      {/* Worth · opened · trade · state · never rung. Every option says how
          many are behind it, so the row answers the question before it is
          clicked. */}
      <FilterBar rows={searchedCallable} f={f} testId="call-sheet-filters" />

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
              onClick={() => startCall(nextUp, true)}
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

      {/*
        * What is happening without you.
        *
        * The three states a lead can be in that are deliberately NOT on this
        * sheet, said out loud. Without them the page is a list that goes
        * quiet for reasons you cannot see — which is the point at which
        * somebody stops believing an empty queue and starts checking the
        * whole book by hand.
        */}
      {meta &&
        (meta.awaitingMockup > 0 || meta.scheduledLater > 0 || meta.autoEmailsThisWeek > 0) && (
          <p className="text-xs text-white/40 mb-4 leading-relaxed">
            Off this sheet on purpose:{' '}
            {[
              meta.awaitingMockup > 0 && `${meta.awaitingMockup} waiting on a mockup`,
              meta.scheduledLater > 0 && `${meta.scheduledLater} booked for a later date`,
              meta.autoEmailsThisWeek > 0 &&
                `${meta.autoEmailsThisWeek} getting an automated follow-up this week`,
            ]
              .filter(Boolean)
              .join(' · ')}
            .
          </p>
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
                {/*
                  * Said out loud, because the whole reason this card exists is
                  * that unlogged calls used to vanish without trace. Knowing
                  * three more are stacked up behind this one is what stops a
                  * rep walking away thinking they're done.
                  */}
                {pendingCalls.length > 1 && (
                  <span className="text-sky-200/80">
                    {' '}
                    {pendingCalls.length - 1} more you rang and haven&apos;t logged.
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => clearPendingCall(pendingCall.id)}
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

      {mockupAsk && (
        <div className="mb-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] p-4">
          <p className="text-sm font-bold text-white/90 break-words">
            Did {mockupAsk.company} want a mockup?
          </p>
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
            Yes puts them on the build queue and takes them off this sheet until it&apos;s sent. No leaves the
            automated follow-up
            {mockupAsk.dueAt ? ` to go out on ${new Date(mockupAsk.dueAt).toLocaleDateString()}` : ' as it is'}.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => answerMockup(true)}
              disabled={mockupSaving}
              className="flex-1 rounded-xl border border-emerald-400/40 bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-40 transition-colors"
            >
              {mockupSaving ? 'Requesting…' : 'Yes — build one'}
            </button>
            <button
              onClick={() => answerMockup(false)}
              disabled={mockupSaving}
              className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-bold text-white/80 hover:bg-white/[0.08] disabled:opacity-40 transition-colors"
            >
              No
            </button>
          </div>
        </div>
      )}

      {mockupDone && !mockupAsk && (
        <p className="text-xs text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2 mb-4">
          {mockupDone}
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

      <div className="mt-6 space-y-3">
        {grouped.map(({ reason, rows }) => {
          const meta = REASONS[reason];
          /*
           * Collapsed unless it is something you would act on now.
           *
           * Seven bands open at once made a page you could not reach the
           * bottom of, and the two that matter — they wrote back, they opened
           * it — were the shortest. So the urgent bands start open and the
           * long tail starts shut, every one of them one tap away, and the
           * choice is remembered. A flat sort has one band and it is the list
           * itself, so it is never collapsed.
           */
          const open = flat || isBandOpen(reason);
          return (
            <section key={reason}>
              <button
                onClick={() => !flat && toggleBand(reason)}
                aria-expanded={open}
                className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-colors ${
                  flat ? 'border-white/15 bg-white/[0.04] text-white/70' : `${meta.classes} hover:brightness-125`
                }`}
              >
                <p className="text-sm font-bold flex items-center gap-1.5">
                  {!flat && reason === 'bounced' && <MailX size={14} />}
                  {!flat && reason === 'overdue' && <AlertTriangle size={14} />}
                  {flat ? (sortBy === 'value' ? 'Biggest deals first' : 'Best time to call first') : meta.label}
                  <span className="ml-1 opacity-60 font-semibold">({rows.length})</span>
                  {!flat && (
                    <ChevronRight
                      size={15}
                      className={`ml-auto shrink-0 opacity-70 transition-transform ${open ? 'rotate-90' : ''}`}
                    />
                  )}
                </p>
                {/* The explanation is the point of the band, so it stays
                    readable when shut — that is when somebody is deciding
                    whether to open it. */}
                <p className="text-xs opacity-70 mt-0.5 leading-relaxed">
                  {flat
                    ? 'Urgency grouping is off while this sort is on — switch back to "Most urgent" to see it.'
                    : meta.blurb}
                </p>
              </button>

              {/* Not rendered rather than hidden. On a book this size a
                  collapsed band is usually the biggest one on the page, and
                  building several hundred rows to then display:none them is
                  the cost this whole change exists to avoid. */}
              <div className="space-y-2 mt-3" data-testid={`band-rows-${reason}`}>
                {(open ? rows : []).map((row) => {
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
                      {/* Only when the band header is gone. Inside a band it
                          restated the heading two lines above it on every
                          single row, which is most of why the page read as an
                          undifferentiated wall. */}
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        {flat && (
                          <Badge tone={REASON_TONE[row.reason]} solid>
                            {REASONS[row.reason].short}
                          </Badge>
                        )}
                        {/* The count travels with the row rather than living
                            in the band header, which disappears the moment a
                            different sort is chosen — and "opened 6 times" is
                            the fact a rep opens the call with. */}
                        {row.opens > 0 && (
                          <Badge tone={row.openBand === 'hot' ? 'amber' : 'neutral'}>
                            <Eye size={10} className="inline -mt-0.5 mr-1" />
                            {row.opens}×
                          </Badge>
                        )}
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

                      {row.reason === 'opened' && (
                        <p className="text-xs text-orange-200/85 mt-1.5 leading-relaxed break-words">
                          {row.openHeadline}
                          {row.openNextStep ? ` — ${row.openNextStep}` : ''}
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

                      {/*
                        * Only when it says something the band does not.
                        *
                        * Every row on this sheet is "on your sheet now" by
                        * definition, so printing that under all of them would
                        * be four hundred lines of noise teaching people to
                        * skip the place the useful sentence appears.
                        */}
                      {/*
                        * Somebody already rang this.
                        *
                        * The one failure the merged sheet made possible and
                        * nothing else can catch: two people see the same lead
                        * at the top and both dial it. Loud inside the window
                        * where somebody might still be on the phone to them,
                        * quiet afterwards — a permanent red flag on every
                        * lead rung this month is a flag nobody reads.
                        */}
                      {row.lastCall &&
                        (() => {
                          const fresh = nowTick - new Date(row.lastCall.at).getTime() < COLLISION_WINDOW_MS;
                          return (
                            <p
                              className={`text-xs mt-1.5 leading-relaxed ${
                                fresh && !row.lastCall.byYou
                                  ? 'text-amber-300 font-semibold'
                                  : 'text-white/35'
                              }`}
                            >
                              {fresh && !row.lastCall.byYou && '⚠ '}
                              {row.lastCall.byName} rang this {agoWords(row.lastCall.at, nowTick)}
                              {row.timesCalled > 1 && ` · ${row.timesCalled} attempts`}
                            </p>
                          );
                        })()}

                      {/*
                        * Four dials and nobody has ever picked up. Advice, not
                        * a rule: it says the number out loud and leaves the
                        * decision where it belongs.
                        */}
                      {row.neverReached && (
                        <p className="text-xs text-amber-300/75 mt-1.5 leading-relaxed">
                          Rung {row.timesCalled} times and never actually reached — worth trying
                          email, or letting this one go.
                        </p>
                      )}

                      {row.nextTouch && row.nextTouch.kind !== 'now' && (
                        <p
                          className={`text-xs mt-1.5 leading-relaxed break-words ${
                            row.nextTouch.needsAttention ? 'text-amber-300/85' : 'text-white/45'
                          }`}
                        >
                          {row.nextTouch.line}
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
                          onClick={() => startCall(row, true)}
                          title={`Call ${row.phone}`}
                          aria-label={`Call ${row.company} on ${row.phone}`}
                          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                        >
                          <Phone size={13} /> Dial
                        </a>
                        {/*
                          * For a call that never went through this app.
                          *
                          * Half of them don't. A rep rings back from their
                          * own recents, or takes an incoming call, or dials
                          * off a business card — and until now there was no
                          * way to say so from the sheet, so the call happened
                          * and the system never heard about it. That is the
                          * same shape as the bug that lost an afternoon of
                          * Evan's work, arriving by a different route.
                          *
                          * Reuses the dial prompt exactly: this drops the
                          * lead onto the same unlogged pile that tapping Dial
                          * does, so there is one way to log a call and not
                          * two that can disagree.
                          *
                          * It deliberately does NOT record a dial. A dial is
                          * the one thing in this system the machine saw for
                          * itself; a call somebody says they made from their
                          * own handset is a claim, and mixing the two would
                          * cost the measurement the only property that makes
                          * it worth having.
                          */}
                        <button
                          onClick={() => startCall(row)}
                          title={`Log a call to ${row.company} you already made`}
                          className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                        >
                          Log
                        </button>
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

      {/*
          Off the sheet, and said out loud.

          These were emailed and no person has opened it, so ringing them is a
          dial into silence — but a list that silently shrank by two hundred
          rows would read as a bug, and the count is the fastest read there is
          on whether a send landed at all. Collapsed, counted, one click away.
      */}
      {visibleNoPhone.length > 0 && (
        <section className="mt-8">
          <div
            className={`rounded-xl border px-3.5 py-2.5 mb-3 ${
              readingNoPhone.length > 0
                ? 'border-amber-400/35 bg-amber-400/[0.08]'
                : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            <p className="text-sm font-bold text-white/70 flex items-center gap-1.5">
              <CalendarClock size={14} /> No phone number on file
              <span className="ml-1 opacity-60">({visibleNoPhone.length})</span>
            </p>
            {/*
                Said separately, because it is a different instruction.

                A lead that has just opened your email and has no number is the
                most valuable row on this page and the only one you cannot ring.
                It used to sit in here unremarked, under a blurb telling you to
                find a number some time — while the alert email had promised it
                would be at the top of the call sheet. Reply to them now; find
                the number afterwards.
            */}
            {readingNoPhone.length > 0 ? (
              <p className="text-xs text-amber-200/80 mt-0.5 leading-relaxed">
                {readingNoPhone.length === 1
                  ? 'One of these is reading your email right now'
                  : `${readingNoPhone.length} of these are reading your email right now`}{' '}
                and there is no number to ring. Reply to that email while it is still open — that is the
                whole opportunity. The rest are due a contact with nothing to dial.
              </p>
            ) : (
              <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                These are due a contact but there is nothing to ring. Find a number, or email them instead.
              </p>
            )}
          </div>
          <div className="space-y-2">
            {visibleNoPhone.map((row) => {
              const reading = row.reason === 'opened';
              return (
                <Link
                  key={row.id}
                  href={`/admin/leads/${row.id}`}
                  className={`block rounded-xl border p-3 transition-colors min-w-0 ${
                    reading
                      ? 'border-amber-400/30 bg-amber-400/[0.06] hover:bg-amber-400/[0.1]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
                >
                  <p className="text-sm font-semibold text-white/80 break-words flex items-center gap-1.5">
                    {row.company}
                    {reading && (
                      <Badge tone="amber">
                        <Eye size={10} /> {row.opens}×
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-white/35 mt-0.5">
                    {reading ? row.openHeadline : REASONS[row.reason].label}
                    {row.email ? ` · ${row.email}` : ' · no email either'}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Gated on the unfiltered count, so narrowing this section to nothing
          can't take its own filter bar off screen with it and strand whoever
          set the filter. */}
      {searchedNoSignal.length > 0 && (
        <section className="mt-8">
          <button
            onClick={() => setShowNoSignal((v) => !v)}
            className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 hover:bg-white/[0.05] transition-colors"
          >
            <p className="text-sm font-bold text-white/70 flex items-center gap-1.5">
              <MailX size={14} /> Emailed, nobody has opened it
              <span className="ml-1 opacity-60">({searchedNoSignal.length})</span>
              <span className="ml-auto text-xs font-medium text-white/40">
                {showNoSignal ? 'Hide' : 'Show anyway'}
              </span>
            </p>
            <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
              Kept off the call sheet on purpose — there is no evidence anybody has seen the message, so a
              call is a dial into silence. They move to the top by themselves the moment one of them opens
              it. A lot of these at once usually means the send had a deliverability problem rather than
              two hundred bad prospects.
            </p>
          </button>
          {showNoSignal && (
            <div className="mt-3">
              {/*
                  Its own filters, and no open-count band — every row in here
                  has nought opens by definition, so those five buttons would
                  all return the same list.

                  Biggest first rather than most urgent: nothing in here has an
                  urgency signal, so the only honest way to order it is by what
                  the deal is worth. That is also how you use it — pull the
                  handful worth chasing by another route out of the pile.
              */}
              <FilterBar
                rows={searchedNoSignal}
                f={nf}
                showOpens={false}
                compact
                testId="no-signal-filters"
              />
              {visibleNoSignal.length === 0 ? (
                <p className="text-xs text-white/35 py-2">
                  None of these {searchedNoSignal.length} match those filters.{' '}
                  <button onClick={nf.clear} className="font-semibold text-white/60 hover:text-white">
                    Clear them
                  </button>
                </p>
              ) : (
                <div className="space-y-2">
                  {[...visibleNoSignal]
                    .sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0))
                    .map((row) => (
                      <Link
                        key={row.id}
                        href={`/admin/leads/${row.id}`}
                        className="block rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 hover:bg-white/[0.05] transition-colors min-w-0"
                      >
                        <p className="text-sm font-semibold text-white/80 break-words">
                          {row.company}
                          {row.estimatedValue ? (
                            <span className="ml-1.5 font-normal text-white/40">
                              {formatCents(row.estimatedValue)}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-white/35 mt-0.5">
                          {row.openHeadline}
                          {row.region ? ` · ${row.region}` : ''}
                        </p>
                      </Link>
                    ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

    </div>
  );
}
