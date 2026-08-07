'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Eye,
  FileSignature,
  Headset,
  Palette,
  Send,
  PhoneCall,
  Wrench,
} from 'lucide-react';
import { formatCents } from '@/lib/pricing';
import { readDelivery } from '@/lib/invoice-delivery';
import { localDayStartParam } from '@/lib/day-window';

/**
 * The top of the dashboard, and the answer to why nobody opened it.
 *
 * The page underneath this was two full dashboards stacked — roughly twenty
 * cards, several answering the same question in different words, none of them
 * saying what to do. Reading it took longer than doing the work, so the phone
 * got picked up from memory instead.
 *
 * This is three lanes in the order the work actually happens: sell it, get
 * paid for it, ship it. Every row is a click into the thing itself. There is
 * no chart here on purpose — a two-person studio does not need a trend line
 * to know how the month is going, it needs to know who to ring.
 */

interface TodayData {
  sell: {
    overdueFollowUps: Array<{
      id: string;
      company: string;
      phone: string | null;
      nextFollowUpAt: string | null;
      estimatedValue: number | null;
    }>;
    repliedCount: number;
    neverContactedCount: number;
    openedMockups: Array<{
      id: string;
      viewCount: number;
      lastViewedAt: string | null;
      lead: { id: string; company: string; phone: string | null };
    }>;
    approvedMockups: Array<{
      id: string;
      respondedAt: string | null;
      responseNote: string | null;
      lead: { id: string; company: string };
    }>;
    unsignedProposals: Array<{
      id: string;
      company: string;
      proposalTotalPrice: number | null;
      /** When it went out. Null only for proposals predating the column. */
      contractSentAt: string | null;
      updatedAt: string;
    }>;
    callsToday: number;
    /*
     * The real sizes of the lists above, which are pages of five.
     *
     * Anything this card states as a total reads one of these. Counting the
     * capped array told somebody with thirty overdue follow-ups that they had
     * five — a dashboard rounding a backlog towards "nearly caught up", which
     * is the one direction it must never round in.
     */
    overdueFollowUpCount: number;
    unsignedProposalCount: number;
    approvedMockupCount: number;
    /**
     * Everybody's day, and the same numbers on every account.
     *
     * Two people working one book need one scoreboard, or "how are we doing"
     * has two answers and neither is the truth. Each row carries what a call
     * turned into, not just that it happened.
     */
    team: Array<{
      userId: string;
      name: string;
      calls: number;
      /** Numbers actually dialled, recorded by the app rather than typed in. */
      dials: number;
      mockupsRequested: number;
      intoFollowUp: number;
    }>;
  };
  money: {
    dueInstalments: Array<{
      id: string;
      label: string;
      amountCents: number;
      dueAt: string | null;
      invoiceNumber: string | null;
      status: string;
      emailSentAt: string | null;
      emailOpenedAt: string | null;
      emailOpens: number;
      linkClickedAt: string | null;
      linkClicks: number;
      project: { id: string; name: string; client: { company: string } };
    }>;
    uninvoiced: Array<{
      projectId: string;
      projectName: string;
      company: string;
      instalmentId: string;
      label: string;
      amountCents: number;
      claim: string;
    }>;
    uninvoicedCount: number;
    uninvoicedTotalCents: number;
    unpaidInvoices: Array<{
      id: string;
      number: string;
      description: string;
      amountCents: number;
      createdAt: string;
      client: { company: string };
      project: { id: string };
    }>;
    unpaidInvoiceCount: number;
    dueInstalmentCount: number;
    /** Every instalment invoiced and unpaid, not just the eight shown. */
    dueInstalmentTotalCents: number;
    collectedThisMonthCents: number;
  };
  deliver: {
    activeProjects: number;
    stalledProjects: Array<{
      id: string;
      name: string;
      status: string;
      updatedAt: string;
      client: { company: string };
    }>;
    mockupRequests: number;
    /** Answered by the client, waiting on us to send the next round. */
    designsOwed: Array<{ id: string; company: string; since: string; nextStage: string }>;
    /** Folder attached, nothing sent. Finished work nobody is chasing. */
    mockupsBuiltNotSent: Array<{
      id: string;
      company: string;
      email: string | null;
      updatedAt: string;
    }>;
    unreadDesignFeedback: Array<{
      id: string;
      round: number;
      createdAt: string;
      consumedRound: boolean;
      project: { id: string; name: string; client: { company: string } };
    }>;
    unreadDesignFeedbackCount: number;
    mockupsBuiltNotSentCount: number;
    stalledProjectCount: number;
  };
}

const daysSince = (iso: string | null) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0;

/** A lane: one question, one colour, a stack of rows you can act on. */
function Lane({
  title,
  question,
  icon: Icon,
  accent,
  children,
}: {
  title: string;
  question: string;
  icon: typeof PhoneCall;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${accent}`}>
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white leading-tight">{title}</h2>
          <p className="text-[11px] text-white/35 leading-tight">{question}</p>
        </div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

/**
 * One actionable row. Always a link — a dashboard row you can read but not
 * click is a fact you now have to go and find somewhere else.
 */
function Row({
  href,
  title,
  detail,
  right,
  tone = 'neutral',
  action,
}: {
  href: string;
  title: string;
  detail: string;
  right?: string;
  tone?: 'neutral' | 'hot' | 'good' | 'warn';
  /**
   * One thing you can do without leaving the page.
   *
   * Rendered outside the link rather than inside it: a button nested in an
   * anchor navigates about half the time, and the half where it does is the
   * half where somebody meant to chase an invoice and landed on a project
   * page instead.
   */
  action?: React.ReactNode;
}) {
  const tones = {
    neutral: 'border-white/[0.06] hover:border-white/15',
    hot: 'border-purple-400/25 bg-purple-400/[0.05] hover:border-purple-400/45',
    good: 'border-emerald-400/25 bg-emerald-400/[0.05] hover:border-emerald-400/45',
    warn: 'border-amber-400/25 bg-amber-400/[0.05] hover:border-amber-400/45',
  };
  return (
    <div
      className={`group flex items-center gap-2.5 rounded-xl border transition-colors ${tones[tone]}`}
    >
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white">{title}</p>
          <p className="truncate text-[11px] text-white/40">{detail}</p>
        </div>
        {right && <span className="shrink-0 text-[12px] tabular-nums text-white/50">{right}</span>}
        {!action && (
          <ArrowRight
            size={13}
            className="shrink-0 text-white/15 group-hover:text-white/40 transition-colors"
          />
        )}
      </Link>
      {action && <div className="shrink-0 pr-2.5">{action}</div>}
    </div>
  );
}

/**
 * Emails the client a fresh payment link for what they owe.
 *
 * The endpoint behind this has existed all along, it works, and its own
 * docstring says "one-click nudge the client, straight from the dashboard".
 * Nothing anywhere called it — so the fastest thing anybody does about late
 * money, on the screen that lists late money, was to open the project, find
 * the balance section and do it from there. Money that is late gets later for
 * want of two clicks.
 *
 * Confirms first, because this puts an email in a client's inbox and a
 * mis-click on a dashboard is cheap to make and awkward to explain.
 */
function ChasePayment({ projectId, onSent }: { projectId: string; onSent: () => void }) {
  const [state, setState] = useState<'idle' | 'confirming' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'sent') {
    return <span className="text-[11px] font-semibold text-emerald-300">Sent</span>;
  }

  const send = async () => {
    setState('sending');
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/payment-reminder`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The route's own words. "No card on file" and "already paid" need
        // completely different things doing about them.
        setError(data.error || "Couldn't send it.");
        setState('idle');
        return;
      }
      setState('sent');
      onSent();
    } catch {
      setError('Could not reach the server.');
      setState('idle');
    }
  };

  return (
    <span className="flex items-center gap-1.5">
      {error && <span className="text-[10.5px] text-amber-300">{error}</span>}
      {state === 'confirming' ? (
        <>
          <button
            onClick={send}
            className="rounded-lg border border-emerald-400/40 bg-emerald-400/20 px-2 py-1 text-[11px] font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/30"
          >
            Email it
          </button>
          <button
            onClick={() => setState('idle')}
            className="text-[11px] text-white/35 transition-colors hover:text-white"
          >
            No
          </button>
        </>
      ) : (
        <button
          onClick={() => setState('confirming')}
          disabled={state === 'sending'}
          className="rounded-lg border border-white/12 px-2 py-1 text-[11px] font-semibold text-white/60 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40"
        >
          {state === 'sending' ? 'Sending…' : 'Chase it'}
        </button>
      )}
    </span>
  );
}

/**
 * Said out loud when a lane is showing a page rather than the list.
 *
 * The rows are capped at five so the card stays a summary. That is the right
 * call and it was never mentioned, so five rows and forty-one rows looked
 * identical — and the lane read as "this is what there is" either way. A
 * summary may abbreviate; it may not imply it hasn't.
 */
function More({ shown, total, href }: { shown: number; total: number; href: string }) {
  if (total <= shown) return null;
  return (
    <Link
      href={href}
      className="block rounded-xl px-3 py-1.5 text-[11px] font-medium text-white/40 hover:bg-white/[0.04] hover:text-white/70 transition-colors"
    >
      {total - shown} more →
    </Link>
  );
}

function Quiet({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-white/[0.07] px-3 py-4 text-center text-[11px] text-white/25">
      {text}
    </p>
  );
}

/**
 * What the phones did today, per person.
 *
 * The dashboard could say "12 calls logged" and nothing else, which answers
 * the least interesting version of the question. What a two-person sales
 * floor actually asks is "how did that go, and for whom" — so each row
 * carries the three things a call turns into: it happened, they wanted a
 * mockup, or they did not and the follow-up sequence picked them up.
 *
 * The same numbers on everybody's screen, deliberately. Two people working
 * one book need one scoreboard; two private ones give "how are we doing" two
 * answers, neither of them the truth.
 *
 * Renders nothing before the first call of the day. A row of zeroes at 9am is
 * a scolding, not information.
 */
function TodayOnThePhones({
  team,
}: {
  team: Array<{
    userId: string;
    name: string;
    calls: number;
    dials: number;
    mockupsRequested: number;
    intoFollowUp: number;
  }>;
}) {
  if (team.length === 0) return null;

  const total = team.reduce(
    (a, p) => ({
      dials: a.dials + p.dials,
      calls: a.calls + p.calls,
      mockups: a.mockups + p.mockupsRequested,
      followUp: a.followUp + p.intoFollowUp,
    }),
    { dials: 0, calls: 0, mockups: 0, followUp: 0 }
  );

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">
          On the phones today
        </p>
        <p className="text-[11px] text-white/35">
          {total.dials} dialled · {total.calls} written up · {total.mockups}{' '}
          {total.mockups === 1 ? 'mockup' : 'mockups'}
        </p>
      </div>

      <div className="space-y-2">
        {team.map((p) => (
          <div
            key={p.userId}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
          >
            <span className="text-sm font-semibold text-white min-w-0 truncate">{p.name}</span>
            {/*
              * Dials first, because it is the only number here nobody typed.
              * It is recorded as the number is tapped, before the phone app
              * takes the screen — there is nothing to press and no way to
              * skip it.
              */}
            <span className="text-sm text-white/80">
              {p.dials} dialled
            </span>
            <span className="text-xs text-white/45">{p.calls} written up</span>
            {/*
              * The gap, said out loud, and only when it is big enough to
              * mean something. Three dials and two write-ups is somebody
              * mid-afternoon; fifteen and two is a day of work that left no
              * record of what happened on it.
              */}
            {p.dials - p.calls >= 3 && (
              <span className="text-xs text-amber-300/85">
                {p.dials - p.calls} with no outcome logged
              </span>
            )}
            {/*
              * The two outcomes, and only when they happened. A dash where a
              * number could be reads as a failure to record something; an
              * absent clause reads as "that did not come up", which is what
              * is actually true.
              */}
            {p.mockupsRequested > 0 && (
              <span className="text-xs text-emerald-300/90">
                {p.mockupsRequested} wanted a mockup
              </span>
            )}
            {p.intoFollowUp > 0 && (
              <span className="text-xs text-sky-300/80">
                {p.intoFollowUp} into the follow-up emails
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The things somebody is waiting on us for, pinned above everything else.
 *
 * The three lanes below are ordered by the shape of the work — sell it, get
 * paid, ship it — which is right for browsing and wrong for the four or five
 * items where a person on the other end has stopped and cannot move until we
 * do something. Those were scattered one lane each, and the expensive ones
 * are the quietest: a mockup request nobody built, a design round we owe
 * after the client answered, finished work never sent.
 *
 * Every row here has the same shape — somebody is blocked on us, and one
 * click unblocks them. It renders nothing at all when that is not true,
 * because a permanent band that usually says "all clear" is a band people
 * stop seeing.
 */
function WaitingOnUs({
  sell,
  deliver,
}: {
  sell: TodayData['sell'];
  deliver: TodayData['deliver'];
}) {
  const rows: Array<{ key: string; icon: typeof Palette; text: string; href: string; cta: string }> = [];

  for (const f of deliver.unreadDesignFeedback) {
    const days = daysSince(f.createdAt);
    rows.push({
      key: `fb-${f.id}`,
      icon: Eye,
      text: `${f.project.client.company} sent design feedback${days > 0 ? ` ${days}d ago` : ''} — nobody has read it`,
      href: `/admin/projects/${f.project.id}`,
      cta: 'Read it',
    });
  }
  for (const d of deliver.designsOwed ?? []) {
    const days = daysSince(d.since);
    rows.push({
      key: `dz-${d.id}`,
      icon: Palette,
      text: `${d.company} is waiting on ${d.nextStage.toLowerCase()}${days > 0 ? ` — ${days}d` : ''}`,
      href: `/admin/projects/${d.id}`,
      cta: 'Send it',
    });
  }
  if (deliver.mockupRequests > 0) {
    rows.push({
      key: 'mk-req',
      icon: Palette,
      text: `${deliver.mockupRequests} mockup${deliver.mockupRequests === 1 ? '' : 's'} requested and not built`,
      href: '/admin/mockup-queue',
      cta: 'Build it',
    });
  }
  for (const m of deliver.mockupsBuiltNotSent) {
    rows.push({
      key: `mk-${m.id}`,
      icon: Send,
      text: `${m.company} — mockup ready, never sent`,
      href: `/admin/leads/${m.id}`,
      cta: 'Send it',
    });
  }
  for (const m of sell.approvedMockups) {
    rows.push({
      key: `ap-${m.id}`,
      icon: CheckCircle2,
      text: `${m.lead.company} approved their mockup — they are waiting on a proposal`,
      href: `/admin/leads/${m.lead.id}`,
      cta: 'Open the deal',
    });
  }

  if (rows.length === 0) return null;

  /*
   * How many people are actually blocked on us, as opposed to how many rows
   * arrived.
   *
   * Every list feeding this band is a page of five, so the header counted the
   * page: "Waiting on us — 5" with nine clients waiting, and a footer offering
   * "and 0 more" underneath it. The number in a band about people who have
   * stopped and cannot move is the last one that should quietly round down.
   */
  const blocked =
    (deliver.unreadDesignFeedbackCount ?? deliver.unreadDesignFeedback.length) +
    (deliver.designsOwed ?? []).length +
    (deliver.mockupRequests > 0 ? 1 : 0) +
    (deliver.mockupsBuiltNotSentCount ?? deliver.mockupsBuiltNotSent.length) +
    (sell.approvedMockupCount ?? sell.approvedMockups.length);

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-4">
      <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.24em] text-amber-300/70">
        Waiting on us — {blocked}
      </p>
      <div className="space-y-1.5">
        {rows.slice(0, 6).map((row) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.key}
              href={row.href}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 transition-colors hover:bg-white/[0.06]"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-sm text-white/85">
                <Icon size={14} className="shrink-0 text-amber-300" />
                <span className="truncate">{row.text}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-amber-200">{row.cta} →</span>
            </Link>
          );
        })}
        {blocked > Math.min(rows.length, 6) && (
          <p className="pt-1 text-xs text-white/35">
            and {blocked - Math.min(rows.length, 6)} more, in the lanes below.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * How often this re-asks on its own.
 *
 * The refresh control drives this card now, which fixed a button that visibly
 * skipped it. What that does not fix is nobody pressing anything: this is the
 * page most likely to be left open from nine in the morning until six, and a
 * card headed "Right now" was answering with whenever the tab was opened.
 *
 * A minute is well inside the resolution anyone works at here, and the request
 * is a single round trip. Background tabs are skipped entirely and refetched
 * the moment they come forward, which is the stale case that actually bites.
 */
const AUTO_REFRESH_MS = 60_000;

export function Today({
  refreshSignal = 0,
  onSettled,
}: {
  /**
   * Bumped by the dashboard's refresh control. This card is the one thing on
   * the page that is always on screen, and it used to load once on mount and
   * never again — so "Updated 2m ago" sat above a list that could be hours
   * old, and the button next to it refreshed only the collapsible breakdown
   * underneath. A refresh control that visibly skips the card above it is
   * worse than none, because the stale list now looks confirmed.
   */
  refreshSignal?: number;
  /** The load finished: a timestamp on success, null on failure. */
  onSettled?: (at: Date | null) => void;
} = {}) {
  const router = useRouter();
  const [data, setData] = useState<TodayData | null>(null);
  const [failed, setFailed] = useState(false);

  /*
   * Four guards a re-fetching card needs and a fetch-once one did not.
   *
   * Never two requests in flight; never replace a good screen with an error
   * because one refresh out of sixty happened to fail; never keep asking once
   * the session is gone; and nothing `load` closes over may be recreated per
   * render, since it is the dependency of both effects below and it sets
   * state — that combination is a loop looking for an excuse.
   */
  const inFlight = useRef(false);
  const hasData = useRef(false);
  /*
   * The brake from lib/use-admin-poll.ts, which exists because the admin's
   * other background loops did not have it: a tab left open overnight kept
   * polling on the same timer after its cookie expired, every request came
   * back 401, and nothing ever gave up — thousands of them a day per
   * abandoned tab. That hook isn't used here because this card also reports
   * back to its parent and needs a first-load failure state, neither of which
   * it exposes; the one lesson worth copying is this flag.
   */
  const sessionGone = useRef(false);
  const routerRef = useRef(router);
  routerRef.current = router;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const load = useCallback(async () => {
    if (inFlight.current || sessionGone.current) return;
    inFlight.current = true;
    try {
      /*
       * The browser's midnight goes with the request.
       *
       * Without it the server counted a UTC day, which for anyone working US
       * hours rolls over mid-evening — so an afternoon of calls read as
       * yesterday and this page said "1 call logged today" to somebody who had
       * made twelve. See lib/day-window.ts.
       *
       * Recomputed per load rather than captured once: a tab left open across
       * midnight would otherwise keep asking for yesterday.
       */
      const res = await fetch(`/api/admin/today?dayStart=${encodeURIComponent(localDayStartParam())}`);
      if (res.status === 401 || res.status === 403) {
        // Final, not a blip: every later tick would be the identical 401.
        sessionGone.current = true;
        routerRef.current.push('/admin/login');
        return;
      }
      const body = res.ok ? await res.json() : null;
      if (body?.success) {
        hasData.current = true;
        setData(body);
        setFailed(false);
        settledRef.current?.(new Date());
      } else if (!hasData.current) {
        setFailed(true);
        settledRef.current?.(null);
      }
    } catch {
      if (!hasData.current) {
        setFailed(true);
        settledRef.current?.(null);
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  // First load, and every time the dashboard's refresh control asks.
  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  useEffect(() => {
    const tick = () => {
      // No polling a tab nobody is looking at; `visibilitychange` also fires
      // on hide, where this is deliberately a no-op. Coming back into view
      // refreshes straight away rather than waiting out an interval that
      // elapsed while nobody could see it.
      if (!document.hidden) load();
    };
    const id = setInterval(tick, AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  if (failed) {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4 text-sm text-amber-200/80">
        Couldn&apos;t load today&apos;s view — the detail below still works.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
        ))}
      </div>
    );
  }

  const { sell, money, deliver } = data;

  // The single sentence at the top. Ranked by what costs the most to ignore:
  // a client who has said yes and is waiting, then money already invoiced,
  // then a warm prospect going cold.
  const headline = (() => {
    /**
     * Top of the list, above the money.
     *
     * Everything below this is something WE can act on whenever we get to it.
     * This is a client who has stopped and is waiting on us — their review
     * clock stopped when they sent it, so nothing moves and no gate opens
     * until somebody reads it. It is also the one item here with a person on
     * the other end wondering whether we received it.
     */
    if (deliver.unreadDesignFeedback.length > 0) {
      const f = deliver.unreadDesignFeedback[0];
      const waiting = daysSince(f.createdAt);
      const feedbackCount = deliver.unreadDesignFeedbackCount ?? deliver.unreadDesignFeedback.length;
      return {
        text:
          feedbackCount === 1
            ? `${f.project.client.company} sent design feedback${waiting > 0 ? ` ${waiting} day${waiting === 1 ? '' : 's'} ago` : ''} and nobody has read it.`
            : `${feedbackCount} clients have sent design feedback nobody has read.`,
        href: `/admin/projects/${f.project.id}`,
        cta: 'Read it',
      };
    }
    if (sell.approvedMockups.length > 0) {
      return {
        text: `${sell.approvedMockups[0].lead.company} approved their mockup. Send the proposal.`,
        href: `/admin/leads/${sell.approvedMockups[0].lead.id}`,
        cta: 'Open the deal',
      };
    }
    /**
     * Above the chase list on purpose. An invoice that's out and unpaid is
     * waiting on somebody else; money past its gate that nobody has invoiced
     * is waiting on us, takes one click, and is the only kind of missing
     * revenue that is entirely our own doing.
     */
    if (money.uninvoiced.length > 0) {
      const first = money.uninvoiced[0];
      const uninvoicedCount = money.uninvoicedCount ?? money.uninvoiced.length;
      return {
        text:
          uninvoicedCount === 1
            ? `${first.company} passed ${first.claim} and ${formatCents(first.amountCents)} was never invoiced.`
            : `${formatCents(money.uninvoicedTotalCents)} across ${uninvoicedCount} payments has passed its gate and never been invoiced.`,
        href: `/admin/projects/${first.projectId}`,
        cta: 'Invoice it',
      };
    }
    if (money.dueInstalments.length > 0) {
      // Both figures come from an aggregate over every due instalment. They
      // used to be summed and counted off the eight rows this card shows, so
      // the sentence announcing everything invoiced and unpaid was reporting
      // one page of it — a money number that quietly rounded down.
      const count = money.dueInstalmentCount ?? money.dueInstalments.length;
      const total =
        money.dueInstalmentTotalCents ?? money.dueInstalments.reduce((s, i) => s + i.amountCents, 0);
      return {
        text: `${formatCents(total)} invoiced and unpaid across ${count} payment${count === 1 ? '' : 's'}.`,
        href: `/admin/projects/${money.dueInstalments[0].project.id}`,
        cta: 'Chase it',
      };
    }
    if (sell.openedMockups.length > 0) {
      return {
        text: `${sell.openedMockups[0].lead.company} has been through their mockup. Ring them while it's fresh.`,
        href: `/admin/call/${sell.openedMockups[0].lead.id}`,
        cta: 'Call now',
      };
    }
    if (sell.overdueFollowUps.length > 0) {
      const overdue = sell.overdueFollowUpCount ?? sell.overdueFollowUps.length;
      return {
        text: `${overdue} follow-up${overdue === 1 ? ' is' : 's are'} overdue.`,
        // ?start=1 — "Start calling" opens the top of the queue rather than
        // the Call HQ page, which is what the words on the button promise.
        href: '/admin/call?start=1',
        cta: 'Start calling',
      };
    }
    // Last, but never skipped. Leaving this out let the headline announce
    // "nothing overdue and nothing waiting" directly above a lane listing a
    // proposal sitting unsigned — a page contradicting itself in one glance.
    if (sell.unsignedProposals.length > 0) {
      const oldest = sell.unsignedProposals[0];
      // How long THEY have had it, not how long since we last touched the
      // row — chasing them is a write, and it used to reset this to zero.
      const days = daysSince(oldest.contractSentAt ?? oldest.updatedAt);
      return {
        text:
          days === 0
            ? `${oldest.company} got their proposal today. Nothing signed yet.`
            : `${oldest.company} has had their proposal ${days} day${days === 1 ? '' : 's'} and hasn't signed.`,
        href: `/admin/leads/${oldest.id}`,
        cta: 'Chase it',
      };
    }
    return {
      text:
        sell.callsToday > 0
          ? `${sell.callsToday} call${sell.callsToday === 1 ? '' : 's'} logged today and nothing outstanding. Good day.`
          : 'Nothing overdue and nothing waiting. Go find some leads.',
      href: '/admin/sales',
      cta: 'Open Sales',
    };
  })();

  return (
    <div className="space-y-4">
      {/* One sentence, one button. Everything else on this page is detail. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-sky-400/20 bg-gradient-to-r from-sky-400/[0.08] to-purple-500/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35 mb-1.5">Right now</p>
          <p className="text-lg font-semibold leading-snug text-white">{headline.text}</p>
        </div>
        <Link
          href={headline.href}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-3 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
        >
          {headline.cta}
          <ArrowRight size={15} />
        </Link>
      </div>

      <WaitingOnUs sell={sell} deliver={deliver} />

      <TodayOnThePhones team={sell.team ?? []} />

      <div className="grid gap-3 lg:grid-cols-3">
        <Lane
          title="Sell"
          question="Who needs talking to?"
          icon={PhoneCall}
          accent="bg-sky-400/15 text-sky-300"
        >
          {sell.approvedMockups.map((m) => (
            <Row
              key={m.id}
              href={`/admin/leads/${m.lead.id}`}
              title={`${m.lead.company} approved their mockup`}
              detail={m.responseNote ? `“${m.responseNote}”` : 'Send the proposal'}
              tone="good"
            />
          ))}
          {sell.openedMockups.map((m) => (
            <Row
              key={m.id}
              href={`/admin/call/${m.lead.id}`}
              title={m.lead.company}
              detail={`Opened their mockup ${m.viewCount} time${m.viewCount === 1 ? '' : 's'}`}
              tone="hot"
            />
          ))}
          {sell.overdueFollowUps.map((l) => (
            <Row
              key={l.id}
              href={`/admin/call/${l.id}`}
              title={l.company}
              detail={`Follow-up ${daysSince(l.nextFollowUpAt)}d overdue`}
              right={l.estimatedValue ? formatCents(l.estimatedValue) : undefined}
              tone="warn"
            />
          ))}
          {sell.unsignedProposals.map((l) => (
            <Row
              key={l.id}
              href={`/admin/leads/${l.id}`}
              title={l.company}
              detail={`Proposal sent ${daysSince(l.contractSentAt ?? l.updatedAt)}d ago, unsigned`}
              right={l.proposalTotalPrice ? formatCents(l.proposalTotalPrice) : undefined}
            />
          ))}
          {sell.approvedMockups.length +
            sell.openedMockups.length +
            sell.overdueFollowUps.length +
            sell.unsignedProposals.length ===
            0 && <Quiet text="Nobody is waiting on you." />}
          <More
            shown={sell.overdueFollowUps.length + sell.unsignedProposals.length}
            total={
              (sell.overdueFollowUpCount ?? sell.overdueFollowUps.length) +
              (sell.unsignedProposalCount ?? sell.unsignedProposals.length)
            }
            href="/admin/sales?view=queue"
          />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {sell.repliedCount > 0 && (
              <Link
                href="/admin/sales?view=queue"
                className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-400/15 transition-colors"
              >
                {sell.repliedCount} replied
              </Link>
            )}
            {sell.neverContactedCount > 0 && (
              <Link
                href="/admin/sales?view=queue"
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-white/50 hover:bg-white/5 transition-colors"
              >
                {sell.neverContactedCount} untouched
              </Link>
            )}
            <Link
              href="/admin/call?start=1"
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.12] transition-colors"
            >
              <Headset size={12} />
              Start calling
            </Link>
          </div>
        </Lane>

        <Lane
          title="Get paid"
          question="What money is moving?"
          icon={Banknote}
          accent="bg-emerald-400/15 text-emerald-300"
        >
          {money.dueInstalments.map((i) => {
            /**
             * An invoice nobody has paid, and an invoice nobody has RECEIVED,
             * look the same on this row — and the second is the more urgent
             * of the two, because chasing it does nothing. When the delivery
             * signal says the email may never have landed, that replaces the
             * due date here: "overdue 9 days" is the wrong thing to read
             * about an invoice that went to a dead address.
             */
            const delivery = readDelivery(i);
            const overdue = Boolean(i.dueAt && new Date(i.dueAt) < new Date());
            return (
              <Row
                key={i.id}
                href={`/admin/projects/${i.project.id}`}
                title={`${i.project.client.company} — ${i.label}`}
                detail={
                  // Short because this row truncates: the full reading, and
                  // what to do about it, is on the project page.
                  delivery.concerning
                    ? 'Never opened — check the address'
                    : i.dueAt
                    ? overdue
                      ? `Overdue ${daysSince(i.dueAt)}d${i.invoiceNumber ? ` · ${i.invoiceNumber}` : ''}`
                      : `Due ${new Date(i.dueAt).toLocaleDateString()}`
                    : 'Invoiced'
                }
                right={formatCents(i.amountCents)}
                tone={delivery.concerning || overdue ? 'warn' : 'neutral'}
                /*
                 * Only on the ones that are actually late. An invoice due next
                 * Friday does not want chasing, and a button offering to is one
                 * somebody presses because it is there.
                 *
                 * And never when the delivery reading says it may never have
                 * arrived — a second copy to a dead address is the one thing
                 * that cannot help, and the row already says to check it.
                 */
                action={
                  overdue && !delivery.concerning ? (
                    /* Refetches, so a chased invoice stops sitting in the
                       overdue list inviting a second email to the same
                       client a moment later. */
                    <ChasePayment projectId={i.project.id} onSent={load} />
                  ) : undefined
                }
              />
            );
          })}
          {money.unpaidInvoices.map((inv) => (
            <Row
              key={inv.id}
              href={`/admin/projects/${inv.project.id}`}
              title={`${inv.client.company} — ${inv.number}`}
              detail={inv.description}
              right={formatCents(inv.amountCents)}
            />
          ))}
          {money.dueInstalments.length + money.unpaidInvoices.length === 0 && (
            <Quiet text="Nothing invoiced and unpaid." />
          )}
          <More
            shown={money.dueInstalments.length + money.unpaidInvoices.length}
            total={
              (money.dueInstalmentCount ?? money.dueInstalments.length) +
              (money.unpaidInvoiceCount ?? money.unpaidInvoices.length)
            }
            href="/admin/priorities"
          />

          {/* Earned and never asked for.
              Distinct from everything above it: nobody is late, because
              nobody has been billed. It sits below the chase list because it
              is our job rather than theirs, and above the totals because it
              is the only thing in this lane you can fix in one click. */}
          {money.uninvoiced.length > 0 && (
            <div className="mt-1 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                Earned — nobody has invoiced it
              </p>
              {money.uninvoiced.map((u) => (
                <Link
                  key={u.instalmentId}
                  href={`/admin/projects/${u.projectId}`}
                  className="-mx-1 flex items-center justify-between gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.05]"
                >
                  <span className="min-w-0 truncate text-xs text-white/70">
                    {u.company}
                    <span className="text-white/35"> · {u.label} · past {u.claim}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-300">
                    {formatCents(u.amountCents)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-1 grid grid-cols-2 gap-1.5 pt-1">
            <div className="rounded-xl border border-white/[0.06] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/30">In this month</p>
              <p className="text-sm font-semibold text-emerald-300">
                {formatCents(money.collectedThisMonthCents)}
              </p>
            </div>
            <div
              className="rounded-xl border border-white/[0.06] px-3 py-2"
              title="Past its gate and never invoiced — money we've earned and not asked for"
            >
              <p className="text-[10px] uppercase tracking-wide text-white/30">Earned, unbilled</p>
              <p
                className={`text-sm font-semibold ${
                  money.uninvoicedTotalCents > 0 ? 'text-emerald-300' : 'text-white/40'
                }`}
              >
                {formatCents(money.uninvoicedTotalCents)}
              </p>
            </div>
          </div>
        </Lane>

        <Lane
          title="Deliver"
          question="What's stuck?"
          icon={Wrench}
          accent="bg-purple-400/15 text-purple-300"
        >
          {/* Above the stalled list, because it is the only genuinely
              blocking thing in this lane: the client has stopped, told us
              exactly what they want, and their review clock has stopped with
              them. Every day it sits unread the project doesn't move and the
              next payment gate stays shut. */}
          {deliver.unreadDesignFeedback.map((f) => (
            <Row
              key={f.id}
              href={`/admin/projects/${f.project.id}`}
              title={`${f.project.client.company} — design feedback`}
              detail={`Round ${f.round} · sent ${daysSince(f.createdAt)}d ago · unread`}
              tone="warn"
            />
          ))}
          {deliver.stalledProjects.map((p) => (
            <Row
              key={p.id}
              href={`/admin/projects/${p.id}`}
              title={p.client.company}
              detail={`${p.status} · untouched ${daysSince(p.updatedAt)}d`}
              tone="warn"
            />
          ))}
          {/* Finished and undelivered. Nothing blocks it, nobody is chasing
              it, and it is the cheapest thing in the pipeline to fix — which
              is exactly why it goes unnoticed. */}
          {deliver.mockupsBuiltNotSent.map((lead) => (
            <Link
              key={lead.id}
              href={`/admin/leads/${lead.id}`}
              className="block rounded-xl border border-purple-400/25 bg-purple-400/[0.06] p-3 hover:bg-purple-400/[0.11] transition-colors"
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold text-purple-200">
                <Send size={13} /> {lead.company}
              </p>
              <p className="text-xs text-white/45 mt-0.5">
                Mockup ready, never sent{lead.email ? '' : ' — and no email on file yet'}.
              </p>
            </Link>
          ))}

          {deliver.stalledProjects.length === 0 &&
            deliver.unreadDesignFeedback.length === 0 &&
            deliver.mockupsBuiltNotSent.length === 0 && (
              <Quiet text="Every project moved this week." />
            )}
          <More
            shown={
              deliver.unreadDesignFeedback.length +
              deliver.stalledProjects.length +
              deliver.mockupsBuiltNotSent.length
            }
            total={
              (deliver.unreadDesignFeedbackCount ?? deliver.unreadDesignFeedback.length) +
              (deliver.stalledProjectCount ?? deliver.stalledProjects.length) +
              (deliver.mockupsBuiltNotSentCount ?? deliver.mockupsBuiltNotSent.length)
            }
            href="/admin/projects"
          />

          <div className="flex flex-wrap gap-1.5 pt-1">
            <Link
              href="/admin/projects"
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-white/50 hover:bg-white/5 transition-colors"
            >
              {deliver.activeProjects} active
            </Link>
            {deliver.mockupRequests > 0 && (
              <Link
                href="/admin/mockup-queue"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-400/15 transition-colors"
              >
                <Palette size={12} />
                {deliver.mockupRequests} mockup{deliver.mockupRequests === 1 ? '' : 's'} to build
              </Link>
            )}
          </div>
        </Lane>
      </div>
    </div>
  );
}

/** Re-exported so the page can render the same icons in its own header. */
export const TODAY_ICONS = { AlertTriangle, CheckCircle2, Eye, FileSignature };
