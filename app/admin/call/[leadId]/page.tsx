'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Phone, ExternalLink, ChevronRight, Clock, Sparkles, Check } from 'lucide-react';
import { buildLeadBrief } from '@/lib/call-brief';
import { CALL_OUTCOMES, type CallOutcome } from '@/lib/call-outcomes';
import { OBJECTIONS } from '@/lib/objections';
import { buildFollowUpDraft, type FollowUpDraft } from '@/lib/follow-up-emails';
import { LOST_REASON_PRESETS, LEAD_STATUS_LABELS, type PainPointKey } from '@/lib/leads';
import { leadLocalTime } from '@/lib/local-time';
import { Kicker, BrandButton, inputClass } from '@/components/admin/ui';
import { recordDialAttempt } from '@/lib/dial-intent';

/**
 * Call HQ — the live-call cockpit.
 *
 * The lead page keeps the full dossier, but it splits what a rep needs
 * DURING a call across two tabs: the script lives on Brief, the outcome
 * logger on The call, and flipping between them mid-conversation is exactly
 * the moment nobody has a spare hand. This screen is that moment, laid out
 * as one view: queue on the left, words to say in the middle, everything to
 * press on the right — script, objections, one-tap outcomes, lost-reason
 * chips (the API always accepted a reason; the old UI just never offered
 * one), and the pre-written follow-up the instant an outcome is logged.
 */

interface QueueLead {
  id: string;
  company: string;
  contactName: string | null;
  reason: string;
}

interface LeadDetail {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  customPainPoints: string | null;
  essentialPoints: string | null;
  upsellPoints: string | null;
  painPoints: PainPointKey[];
  estimateLowCents: number | null;
  estimateHighCents: number | null;
  // What a research import actually fills in. The brief falls back to these
  // when nobody has written numbered pain points, which is every imported
  // lead — see lib/call-brief.ts.
  personalizedObservation: string | null;
  currentSiteAssessment: string | null;
  assignedTo?: { name: string | null } | null;
  activities: { id: string; type: string; content: string; createdAt: string; createdBy?: { name: string | null } | null }[];
  mockupUrl?: string | null;
}

/**
 * Why this lead is in front of you, in three or four words.
 *
 * Every band the call list can produce has to be in here. Three of them were
 * missing after the bands were added, so the queue rail printed raw keys —
 * "mockup-sent", "never-contacted" — at the one moment somebody is deciding
 * which name to click.
 */
const REASON_LABEL: Record<string, string> = {
  replied: 'They wrote back',
  'mockup-sent': 'Has the mockup',
  'mockup-stalled': 'Mockup overdue',
  opened: 'Opened your email',
  bounced: 'Email bounced',
  overdue: 'Overdue',
  today: 'Due today',
  'no-follow-up': 'No follow-up set',
  'never-contacted': 'Never contacted',
  'awaiting-mockup': 'Waiting on a mockup',
  scheduled: 'Scheduled',
};

/** The bands worth colouring, because they change how you open the call. */
const REASON_TONE: Record<string, string> = {
  replied: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  'mockup-sent': 'border-teal-400/40 bg-teal-400/10 text-teal-200',
  'mockup-stalled': 'border-rose-400/40 bg-rose-400/10 text-rose-200',
  opened: 'border-orange-400/40 bg-orange-400/10 text-orange-200',
  bounced: 'border-red-400/30 bg-red-400/[0.07] text-red-200',
  overdue: 'border-amber-400/30 bg-amber-400/[0.07] text-amber-200',
};

function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function CallCockpit() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.leadId as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [queue, setQueue] = useState<QueueLead[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Outcome state
  const [pendingOutcome, setPendingOutcome] = useState<CallOutcome | null>(null);
  const [outcomeDate, setOutcomeDate] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Tidying the note. `noteBeforeTidy` exists so the rep can put their own
  // words back with one tap — a rewrite you can't undo is one you have to
  // read carefully every time, which costs more than it saves.
  const [tidying, setTidying] = useState(false);
  const [tidyError, setTidyError] = useState<string | null>(null);
  const [noteBeforeTidy, setNoteBeforeTidy] = useState<string | null>(null);
  const [nextStep, setNextStep] = useState('');

  // Post-outcome follow-up
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [sendingDraft, setSendingDraft] = useState(false);
  const [draftDone, setDraftDone] = useState<string | null>(null);

  /**
   * The one question worth asking the moment a call ends.
   *
   * `mockupAsk` holds the date the automated follow-up got booked for, which
   * is what makes the "No" answer mean something concrete on screen rather
   * than being a button that appears to do nothing. `mockupAnswer` is what
   * was decided, kept so the card can confirm it instead of vanishing —
   * a card that disappears on tap leaves the rep unsure it registered.
   */
  const [mockupAnswer, setMockupAnswer] = useState<'yes' | 'no' | null>(null);
  const [mockupSaving, setMockupSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);

  /**
   * Everything that follows one logged call, in one place.
   *
   * There used to be up to three cards on screen at once after logging — an
   * outcome confirmation, a mockup question and an open follow-up draft — all
   * appearing together with nothing to say which came first or whether the
   * call was actually finished with. That is the friction: not the number of
   * steps but their arrival all at once, with no end.
   *
   * Now it is one card that walks through them and finishes on "next call".
   * `null` means no call has been logged this visit, which is also what makes
   * the outcome buttons disappear while it is up — one thing to do at a time.
   */
  const [wrapUp, setWrapUp] = useState<{
    outcomeLabel: string;
    askAboutMockup: boolean;
    dueAt: string | null;
    nextTouchLine: string;
  } | null>(null);

  /**
   * Whether the number has been dialled on this visit.
   *
   * This screen is two screens in sequence and only ever admitted to being
   * one. Before the call you want the script; after it you want the outcome
   * buttons — and on a phone, where these calls actually get made, the
   * buttons sat below the whole script and eight objection accordions. Coming
   * back from the dialler meant a long scroll past everything you no longer
   * needed to reach the one thing you did, which is a large part of why calls
   * went unlogged.
   *
   * The app already knows which of the two moments it is in, because it
   * records the dial. Kept in sessionStorage because the phone app takes the
   * screen and the page may be discarded before it comes back — the state has
   * to survive exactly the event that makes it true.
   */
  const [dialled, setDialled] = useState(false);

  const actionsRef = useRef<HTMLDivElement | null>(null);
  const activeRailRef = useRef<HTMLAnchorElement | null>(null);
  /** Cancels the watcher from a previous tap, so two taps cannot both fire. */
  const cancelArmedDial = useRef<(() => void) | null>(null);

  /*
   * And cancels it on the way out.
   *
   * An armed tap listens on the document, not on this component, so leaving
   * one behind means a page that has gone can still record a dial the next
   * time the browser is backgrounded — against a lead nobody is looking at.
   */
  useEffect(() => () => cancelArmedDial.current?.(), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`);
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data?.success) setLead(data.lead);
      else setLoadError(true);
    } catch {
      setLoadError(true);
    }
  }, [leadId, router]);

  useEffect(() => {
    load();
    fetch('/api/admin/leads/call-list')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) setQueue(data.callable ?? []);
      })
      .catch(() => {});
  }, [load]);

  // Local-time chip stays honest across a long session.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  /*
   * Coming back from the phone app.
   *
   * The dial happened on another screen entirely and this page may have been
   * discarded while it did, so the flag is read back on mount and again every
   * time the tab becomes visible. Without the second one, returning to a page
   * the browser kept alive leaves it still showing "Call" — which is the
   * exact moment the outcome buttons are wanted.
   */
  useEffect(() => {
    const read = () => {
      try {
        if (sessionStorage.getItem(`dialled:${leadId}`) === '1') setDialled(true);
      } catch {
        /* private mode — the bar just won't survive the app switch */
      }
    };
    read();
    const onVisible = () => document.visibilityState === 'visible' && read();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [leadId]);

  /**
   * Somebody already rang this, recently, and it wasn't necessarily you.
   *
   * The call sheet is one shared list now — which is the point, and which
   * means both of you can be looking at the same business at the top of it.
   * This screen is the last place to catch that before the phone rings at
   * their end, so it is checked here too rather than only on the sheet.
   *
   * Read off the activity list the page already loads, so it costs nothing
   * and cannot disagree with the history shown further down.
   */
  const recentCall = useMemo(() => {
    // A dial counts as much as a logged call here — more, if anything. The
    // dangerous window is the ten minutes after somebody tapped a number and
    // before they have written up what happened, which is exactly when the
    // lead still looks untouched to everybody else.
    const last = lead?.activities?.find((a) => a.type === 'call' || a.type === 'dial');
    if (!last) return null;
    const minsAgo = Math.round((Date.now() - new Date(last.createdAt).getTime()) / 60000);
    if (minsAgo > 180) return null;
    return { minsAgo, by: last.createdBy?.name || 'Someone' };
  }, [lead]);

  /*
   * Number keys pick an outcome, Escape backs out.
   *
   * Forty calls in an afternoon is forty round trips from keyboard to mouse
   * and back, to press one of ten buttons that never move. The shortcut is
   * not a power feature — it is the difference between logging the call and
   * deciding to log it later, which in practice means not at all.
   *
   * Deliberately does NOT bind Enter to submit. Logging is the one action
   * here that emails a customer and moves a deal, and a stray Enter from a
   * textarea somebody thought they were still typing in is not a mistake
   * worth making fast.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Never while somebody is writing the note — the shortcut would eat
      // the digit, which is worse than not having one.
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el?.isContentEditable) return;

      if (e.key === 'Escape') {
        setPendingOutcome(null);
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > CALL_OUTCOMES.length) return;
      e.preventDefault();
      const outcome = CALL_OUTCOMES[n - 1]!;
      setPendingOutcome((prev) => (prev?.key === outcome.key ? null : outcome));
      setActionError(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const brief = useMemo(() => (lead ? buildLeadBrief(lead) : null), [lead]);
  const local = lead ? leadLocalTime(lead.phone, now) : null;

  const positionInQueue = queue.findIndex((q) => q.id === leadId);
  const nextInQueue = positionInQueue >= 0 ? queue[positionInQueue + 1] : queue[0];
  /**
   * Why this business is in front of you.
   *
   * The rail says it for every OTHER lead in the queue and said nothing about
   * the one on screen — so the single most useful thing to know before
   * dialling ("they opened your email six times") was on the page you had
   * just left. It changes how the call opens, which makes it a header fact
   * rather than a detail.
   */
  const reason = positionInQueue >= 0 ? queue[positionInQueue]!.reason : null;

  // Keeps the rail pointing at where you actually are in the queue.
  useEffect(() => {
    activeRailRef.current?.scrollIntoView({ block: 'nearest' });
  }, [leadId, queue.length]);

  /** Jumps to the outcome buttons. On a phone they are a long way down. */
  const goToActions = () =>
    actionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /**
   * Hands the scribbled note over to be tidied and fills the fields with
   * what comes back. Nothing is saved — the rep still presses Log it, and
   * can undo, edit, or ignore any of it first.
   */
  async function tidyNote() {
    if (!lead || !note.trim()) return;
    setTidying(true);
    setTidyError(null);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}/tidy-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, outcome: pendingOutcome?.key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTidyError(data.error || "Couldn't tidy that up — log the note as you wrote it.");
        return;
      }
      setNoteBeforeTidy(note);
      if (data.note) setNote(data.note);
      setNextStep(data.nextStep || '');
      // Only ever fills a date the rep hasn't already set themselves.
      if (data.followUpDate && !outcomeDate) setOutcomeDate(data.followUpDate);
    } catch {
      setTidyError("Couldn't tidy that up — log the note as you wrote it.");
    } finally {
      setTidying(false);
    }
  }

  async function logOutcome(outcome: CallOutcome) {
    if (!lead) return;
    setSaving(true);
    setActionError(null);
    try {
      // The next step is part of the record, not a separate note to lose.
      const body = [note.trim(), nextStep.trim() ? `Next: ${nextStep.trim()}` : '']
        .filter(Boolean)
        .join('\n\n');
      const res = await fetch(`/api/admin/leads/${lead.id}/call-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: outcome.key,
          note: body || undefined,
          followUpAt: outcomeDate || undefined,
          // The route always took a reason; the old UI never sent one, so
          // every phone loss was recorded as a generic shrug.
          lostReason: outcome.status === 'lost' ? lostReason || undefined : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || 'Could not log the call — it has NOT been saved.');
        return;
      }
      setPendingOutcome(null);
      setNote('');
      setNextStep('');
      setNoteBeforeTidy(null);
      setTidyError(null);
      setOutcomeDate('');
      setLostReason('');
      // Whether to ask about a mockup is the route's decision, not this
      // screen's, so the question and the sequence that follows from it can
      // never disagree about who qualifies.
      setMockupAnswer(null);
      setWrapUp({
        outcomeLabel: outcome.label,
        askAboutMockup: Boolean(data.askAboutMockup),
        dueAt: data.autoFollowUpDueAt ?? null,
        nextTouchLine: data.nextTouch?.line ?? '',
      });
      const followUp = buildFollowUpDraft(outcome.key, {
        company: lead.company,
        contactName: lead.contactName,
        essentials: brief?.essentials ?? [],
        low: brief?.low ?? null,
        high: brief?.high ?? null,
      });
      if (followUp && lead.email) {
        setDraft(followUp);
        setDraftSubject(followUp.subject);
        setDraftBody(followUp.body);
        setDraftDone(null);
      }
      await load();
    } catch {
      setActionError('Could not log the call — it has NOT been saved.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Answers "did they want a mockup?".
   *
   * Yes puts the lead on the build queue and cancels the automated email —
   * the mockup is the follow-up, and both arriving in the same week is how a
   * warm lead learns our emails are automatic.
   *
   * No sends nothing and changes nothing, because logging the call already
   * booked the follow-up. That is on purpose: if this question is ignored, or
   * the tab is closed, or the call was logged from the queue's quick buttons
   * instead, the lead still gets its second touch. The default has to be the
   * thing that happens anyway — a question whose unanswered case is "nothing"
   * is a question that silently loses leads.
   */
  async function answerMockup(wanted: boolean) {
    if (!lead) return;
    if (!wanted) {
      setMockupAnswer('no');
      return;
    }
    setMockupSaving(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupRequested: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || "Couldn't put the mockup request in — try it from their page.");
        return;
      }
      setMockupAnswer('yes');
      // Asking for a mockup cancels the automated email, so the line that
      // said one was going out on Tuesday has to stop saying it.
      setWrapUp((w) =>
        w
          ? {
              ...w,
              dueAt: null,
              nextTouchLine: 'Waiting on their mockup — back on your sheet the day it goes out',
            }
          : w
      );
      await load();
    } catch {
      setActionError("Couldn't put the mockup request in — try it from their page.");
    } finally {
      setMockupSaving(false);
    }
  }

  /**
   * Stops the automated emails for this lead.
   *
   * Here rather than buried on the lead page because this is the moment the
   * rep learns one is coming — the wrap-up card has just told them the date.
   * An automated email you can watch approaching and cannot stop is worse
   * than no automation at all: it makes the rep distrust every other thing
   * the system does on their behalf.
   */
  /**
   * Arms the dial record, and lets iOS decide whether it counts.
   *
   * Tapping a `tel:` link does not place a call — iOS puts up its own
   * Call/Cancel sheet first, and nothing has happened until one of those is
   * pressed. Recording from the click handler counted every cancel and every
   * mis-tap in the one number that exists to be trustworthy.
   *
   * Which is also why the screen does not flip into its after-the-call shape
   * here: somebody who backs out of the sheet should find the page exactly as
   * they left it, script and all. See lib/dial-intent.ts.
   */
  function armDial() {
    if (!lead) return;
    cancelArmedDial.current?.();
    cancelArmedDial.current = recordDialAttempt(`/api/admin/leads/${lead.id}/dial`, () => {
      setDialled(true);
      try {
        sessionStorage.setItem(`dialled:${leadId}`, '1');
      } catch {
        /* private mode — the bar just won't survive the app switch */
      }
    });
  }

  /**
   * "Not now." The exit this screen never had.
   *
   * You open a lead, see it is half seven in the evening where they are, and
   * the only ways out were the browser's back button or ringing them anyway.
   * The call sheet has had this since the beginning; the screen you are
   * standing on when you actually make the decision did not.
   *
   * Pushes the follow-up date out and moves straight to the next lead,
   * because the reason somebody presses this is that they are working a queue
   * and this one is in the way.
   */
  async function skipFor(days: number) {
    if (!lead) return;
    setSkipping(true);
    setActionError(null);
    try {
      const when = new Date();
      when.setDate(when.getDate() + days);
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextFollowUpAt: when.toISOString() }),
      });
      if (!res.ok) {
        setActionError("Couldn't move that one — try it from the call sheet.");
        return;
      }
      if (nextInQueue && nextInQueue.id !== leadId) router.push(`/admin/call/${nextInQueue.id}`);
      else router.push('/admin/call');
    } catch {
      setActionError("Couldn't move that one — try it from the call sheet.");
    } finally {
      setSkipping(false);
    }
  }

  async function stopAutoFollowUp() {
    if (!lead) return;
    setMockupSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelAutoFollowUp: true }),
      });
      if (!res.ok) {
        setActionError("Couldn't stop those — try it from their page.");
        return;
      }
      setWrapUp((w) =>
        w ? { ...w, dueAt: null, nextTouchLine: 'Automated emails stopped for this one' } : w
      );
    } catch {
      setActionError("Couldn't stop those — try it from their page.");
    } finally {
      setMockupSaving(false);
    }
  }

  async function sendFollowUp() {
    if (!lead) return;
    setSendingDraft(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: draftSubject, body: draftBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "The follow-up didn't send.");
        return;
      }
      setDraft(null);
      setDraftDone('Follow-up sent.');
      await load();
    } catch {
      setActionError("The follow-up didn't send.");
    } finally {
      setSendingDraft(false);
    }
  }

  if (loadError) {
    return <p className="p-8 text-amber-300 text-sm">Couldn&apos;t load this lead — refresh to retry.</p>;
  }
  if (!lead || !brief) {
    return <p className="p-8 text-white/40 text-sm">Loading the call…</p>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Queue rail */}
      <aside className="hidden xl:flex w-64 shrink-0 flex-col border-r border-white/[0.08]">
        <div className="px-4 py-4 border-b border-white/[0.08]">
          <Kicker>Call queue</Kicker>
          <p className="text-sm text-white/50 mt-1.5">
            {positionInQueue >= 0 ? `${positionInQueue + 1} of ${queue.length}` : `${queue.length} to call`}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {queue.map((q, i) => (
            <Link
              key={q.id}
              href={`/admin/call/${q.id}`}
              /* Scrolled into view on arrival. Forty leads in, the rail was
                 showing the first fifteen and no clue where you were in it. */
              ref={q.id === leadId ? activeRailRef : undefined}
              className={`block px-4 py-3 border-b border-white/[0.04] transition-colors ${
                q.id === leadId ? 'bg-white/[0.05] border-l-2 border-l-sky-400' : 'hover:bg-white/[0.03]'
              }`}
            >
              <p className="text-sm font-medium truncate">{q.company}</p>
              <p className="text-[11px] text-white/35">
                {i + 1} · {REASON_LABEL[q.reason] ?? q.reason}
              </p>
            </Link>
          ))}
          {queue.length === 0 && <p className="px-4 py-6 text-xs text-white/30">Queue is empty.</p>}
        </div>
      </aside>

      {/* Main: header + script + actions */}
      <div className="flex-1 min-w-0">
        {/* Header — who, where, when, and the dial button. */}
        <div className="sticky top-0 z-20 bg-ink/95 backdrop-blur border-b border-white/[0.08] px-5 py-4">
          {/*
            * Above the dial button, not below it. A warning you read after
            * pressing call is not a warning.
            */}
          {recentCall && (
            <p className="mb-2.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200">
              ⚠ {recentCall.by} rang this{' '}
              {recentCall.minsAgo < 1
                ? 'a moment ago'
                : recentCall.minsAgo < 60
                  ? `${recentCall.minsAgo} minutes ago`
                  : `${Math.round(recentCall.minsAgo / 60)} ${
                      Math.round(recentCall.minsAgo / 60) === 1 ? 'hour' : 'hours'
                    } ago`}
              . Check the notes below before you dial.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-lg font-bold truncate">{lead.company}</h1>
                {reason && REASON_LABEL[reason] && (
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                      REASON_TONE[reason] ?? 'border-white/15 text-white/50'
                    }`}
                  >
                    {REASON_LABEL[reason]}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 truncate">
                {lead.contactName || 'No named contact'} · {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status}
                {brief.low > 0 && (
                  <>
                    {' '}
                    · quoting {money(brief.low)}–{money(brief.high)}
                  </>
                )}
                {/* The rail says this too, and the rail is hidden below xl —
                    so this is the only place it appears on a laptop or a
                    phone, and duplicated on a big screen rather than absent
                    on a small one. */}
                {positionInQueue >= 0 && (
                  <span className="xl:hidden">
                    {' '}
                    · {positionInQueue + 1} of {queue.length} today
                  </span>
                )}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {local && (
                <span
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                    local.callability === 'good'
                      ? 'border-emerald-400/30 text-emerald-300'
                      : local.callability === 'okay'
                      ? 'border-amber-400/30 text-amber-300'
                      : 'border-red-400/30 text-red-300'
                  }`}
                >
                  <Clock size={11} />
                  {local.time} their time
                </span>
              )}
              {lead.phone ? (
                <a
                  href={`tel:${lead.phone}`}
                  onClick={armDial}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
                >
                  <Phone size={15} />
                  {lead.phone}
                </a>
              ) : (
                <span className="text-xs text-amber-300">No phone on file</span>
              )}
              <Link
                href={`/admin/leads/${lead.id}`}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs text-white/70 hover:bg-white/5"
              >
                Full lead
                <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_360px] gap-0">
          {/*
            * The script, and on a phone it moves out of the way once the
            * number has been dialled.
            *
            * Before the call it is the whole point of the screen. After it,
            * it is several hundred pixels of words you have already said,
            * sitting between you and the only thing left to do. The order
            * flips on the one event that tells the two moments apart. On a
            * desktop the columns are side by side and neither is ever in the
            * other's way, so nothing moves.
            */}
          <div className={`px-5 py-6 space-y-6 min-w-0 ${dialled ? 'order-2 lg:order-none' : ''}`}>
            <Kicker>The words</Kicker>
            {brief.script.map((block, i) => (
              <div key={i}>
                <h2 className="text-[13px] font-semibold text-white/80 mb-2">{block.heading}</h2>
                {block.kind === 'spoken' ? (
                  <div className="space-y-2">
                    {block.lines.map((line, j) => (
                      <p key={j} className="text-[15px] leading-relaxed text-white border-l-2 border-sky-400/40 pl-3">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {block.lines.map((line, j) => (
                      <p key={j} className="text-[13px] leading-relaxed text-white/45 italic pl-3">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Objections, in reach without leaving the screen */}
            <div className="pt-2">
              <Kicker className="mb-3">When they push back</Kicker>
              <div className="space-y-2">
                {OBJECTIONS.map((o) => (
                  <details key={o.slug} className="group rounded-lg border border-white/[0.07] bg-white/[0.02]">
                    <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm text-white/70 hover:text-white list-none">
                      <span>&ldquo;{o.trigger}&rdquo;</span>
                      <ChevronRight size={14} className="transition-transform group-open:rotate-90 text-white/30" />
                    </summary>
                    <div className="px-3 pb-3 space-y-2 text-[13px]">
                      <p className="text-white/40 italic">{o.meaning}</p>
                      <p className="text-white border-l-2 border-emerald-400/40 pl-3">{o.response}</p>
                      <p className="text-white/40">{o.thenWhat}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>

          {/* The actions */}
          <div
            ref={actionsRef}
            className={`border-t lg:border-t-0 lg:border-l border-white/[0.08] px-5 py-6 space-y-5 pb-28 lg:pb-6 ${
              dialled ? 'order-1 lg:order-none' : ''
            }`}
          >
            {/*
              * Hidden once a call has been logged, because the wrap-up card
              * below is the only thing left to do. Ten outcome buttons still
              * on screen underneath a "Logged" confirmation is what made it
              * unclear whether the call had actually been recorded.
              */}
            <div className={wrapUp ? 'hidden' : undefined}>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <Kicker>How did it go?</Kicker>
                {/* Discoverable without a tour. Desktop only, because there
                    is no number row on a phone to press. */}
                <span className="hidden lg:inline text-[10.5px] text-white/25">
                  press 1–{CALL_OUTCOMES.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CALL_OUTCOMES.map((o, i) => (
                  <button
                    key={o.key}
                    onClick={() => {
                      setPendingOutcome((prev) => (prev?.key === o.key ? null : o));
                      setActionError(null);
                    }}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                      pendingOutcome?.key === o.key
                        ? 'border-sky-400/50 bg-sky-400/10 text-white'
                        : o.tone === 'good'
                        ? 'border-emerald-400/20 text-emerald-200 hover:bg-emerald-400/5'
                        : o.tone === 'bad'
                        ? 'border-red-400/20 text-red-200 hover:bg-red-400/5'
                        : 'border-white/10 text-white/70 hover:bg-white/5'
                    }`}
                  >
                    <span className="hidden lg:block shrink-0 mt-[1px] font-mono text-[10px] text-white/25">
                      {i + 1}
                    </span>
                    <span className="min-w-0">{o.label}</span>
                  </button>
                ))}
              </div>

              {pendingOutcome && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                  <p className="text-xs text-white/50">{pendingOutcome.hint}</p>

                  {pendingOutcome.status === 'lost' && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1.5">Why? (goes on the record)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {LOST_REASON_PRESETS.map((r) => (
                          <button
                            key={r}
                            onClick={() => setLostReason((prev) => (prev === r ? '' : r))}
                            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                              lostReason === r
                                ? 'border-red-400/50 bg-red-400/10 text-red-200'
                                : 'border-white/15 text-white/50 hover:text-white'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(pendingOutcome.askForDate || pendingOutcome.followUpDays !== null) && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1.5">
                        {pendingOutcome.askForDate ? 'When? (required)' : 'Next follow-up'}
                      </p>
                      <input type="date" value={outcomeDate} onChange={(e) => setOutcomeDate(e.target.value)} className={inputClass} />
                      {!pendingOutcome.askForDate && pendingOutcome.followUpDays !== null && (
                        <p className="text-[11px] text-white/35 mt-1">
                          Leave blank and it&apos;ll set one for {pendingOutcome.followUpDays} days&apos; time.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <textarea
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        setNoteBeforeTidy(null);
                      }}
                      placeholder="Anything worth remembering from the call — shorthand is fine"
                      rows={3}
                      className={inputClass}
                      aria-label="Call note"
                    />

                    {note.trim() && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={tidyNote}
                          disabled={tidying}
                          className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[11.5px] text-white/60 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40"
                        >
                          <Sparkles size={11} aria-hidden="true" />
                          {tidying ? 'Tidying…' : 'Tidy it up'}
                        </button>
                        {noteBeforeTidy !== null && (
                          <button
                            type="button"
                            onClick={() => {
                              setNote(noteBeforeTidy);
                              setNoteBeforeTidy(null);
                              setNextStep('');
                            }}
                            className="rounded-full border border-white/10 px-3 py-1 text-[11.5px] text-white/40 transition-colors hover:text-white"
                          >
                            Put mine back
                          </button>
                        )}
                      </div>
                    )}

                    {tidyError && <p className="text-[11px] text-amber-300">{tidyError}</p>}

                    {nextStep && (
                      <div>
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-white/40">
                          Next step — goes on the record with the note
                        </p>
                        <input
                          value={nextStep}
                          onChange={(e) => setNextStep(e.target.value)}
                          className={inputClass}
                          aria-label="Next step"
                        />
                      </div>
                    )}
                  </div>

                  <BrandButton
                    onClick={() => logOutcome(pendingOutcome)}
                    disabled={saving || (pendingOutcome.askForDate === true && !outcomeDate)}
                    className="w-full"
                  >
                    {saving ? 'Saving…' : `Log it — ${pendingOutcome.label.toLowerCase()}`}
                  </BrandButton>
                </div>
              )}

              {actionError && <p className="mt-2 text-xs text-amber-300">{actionError}</p>}

              {/*
                * The other honest answer to "how did it go?", which is that
                * it did not — wrong hour, wrong day, not now. Without it the
                * only ways off this screen were the back button and ringing
                * somebody at seven in the evening.
                */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-3">
                <span className="text-[11px] text-white/25">Not now —</span>
                {[
                  [1, 'tomorrow'],
                  [3, '3 days'],
                  [7, 'a week'],
                ].map(([days, label]) => (
                  <button
                    key={label as string}
                    onClick={() => skipFor(days as number)}
                    disabled={skipping}
                    className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-white/50 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/*
              * The wrap-up: one card, in order, ending on the next call.
              *
              * Everything here used to appear at once and separately — a
              * mockup question beside an open draft beside a quiet "Next"
              * link at the bottom of the page — with nothing to say which
              * came first or when the call was actually done with. The steps
              * were never the problem; arriving together with no ending was.
              */}
            {wrapUp && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-3.5 space-y-3">
                <div className="flex items-start gap-2">
                  <Check size={15} className="text-emerald-300 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white">
                      Logged — {wrapUp.outcomeLabel.toLowerCase()}
                    </p>
                    {/* The sentence that answers "will this pester me again?"
                        — the whole reason the card leads with it. */}
                    {wrapUp.nextTouchLine && (
                      <p className="text-[12px] text-emerald-200/90 mt-0.5 leading-relaxed">
                        {wrapUp.nextTouchLine}
                        {wrapUp.dueAt && (
                          <>
                            {' · '}
                            <button
                              onClick={stopAutoFollowUp}
                              disabled={mockupSaving}
                              className="underline underline-offset-2 text-emerald-200/70 hover:text-white disabled:opacity-40"
                            >
                              stop those
                            </button>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Step one, and only while it is unanswered. */}
                {wrapUp.askAboutMockup && mockupAnswer === null && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
                    <div>
                      <p className="text-[13px] font-semibold text-white">Did they want a mockup?</p>
                      <p className="text-[11px] text-white/45 mt-0.5 leading-relaxed">
                        Yes puts them on the build queue and off your sheet until it&apos;s sent. No changes
                        nothing — the follow-up emails are already booked.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <BrandButton onClick={() => answerMockup(true)} disabled={mockupSaving} className="flex-1">
                        {mockupSaving ? 'Requesting…' : 'Yes — build one'}
                      </BrandButton>
                      <BrandButton variant="quiet" onClick={() => answerMockup(false)} disabled={mockupSaving}>
                        No
                      </BrandButton>
                    </div>
                  </div>
                )}

                {/*
                  * Step two, and deliberately behind the question above: a
                  * seven-row textarea open beside an unanswered yes/no is how
                  * both get ignored.
                  */}
                {draft && (!wrapUp.askAboutMockup || mockupAnswer !== null) && (
                  <div className="rounded-lg border border-sky-400/25 bg-sky-400/[0.05] p-3 space-y-2.5">
                    <div>
                      <p className="text-[13px] font-semibold text-white">Write to them now?</p>
                      <p className="text-[11px] text-white/40 mt-0.5">{draft.why}</p>
                    </div>
                    <input
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                      className={inputClass}
                      aria-label="Follow-up subject"
                    />
                    <textarea
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      rows={7}
                      className={`${inputClass} font-mono text-[12px]`}
                      aria-label="Follow-up body"
                    />
                    <div className="flex gap-2">
                      <BrandButton onClick={sendFollowUp} disabled={sendingDraft} className="flex-1">
                        {sendingDraft ? 'Sending…' : `Send to ${lead.email}`}
                      </BrandButton>
                      <BrandButton variant="quiet" onClick={() => setDraft(null)}>
                        Skip
                      </BrandButton>
                    </div>
                  </div>
                )}

                {draftDone && !draft && <p className="text-[12px] text-emerald-300">{draftDone}</p>}

                {/*
                  * The end of the card, and the end of the call. A queue you
                  * work forty at a time needs the next one to be the biggest
                  * thing on screen when you finish this one — not a grey link
                  * below the activity history.
                  */}
                {nextInQueue && nextInQueue.id !== leadId ? (
                  <Link
                    href={`/admin/call/${nextInQueue.id}`}
                    className="flex items-center justify-between rounded-lg bg-emerald-400/15 border border-emerald-400/30 px-3 py-2.5 text-[13px] font-semibold text-emerald-100 hover:bg-emerald-400/25 transition-colors"
                  >
                    <span className="truncate">Next call — {nextInQueue.company}</span>
                    <ChevronRight size={15} className="shrink-0" />
                  </Link>
                ) : (
                  <Link
                    href="/admin/sales"
                    className="flex items-center justify-between rounded-lg border border-white/12 px-3 py-2.5 text-[13px] font-semibold text-white/75 hover:bg-white/5 transition-colors"
                  >
                    <span>That&apos;s the queue — back to the sheet</span>
                    <ChevronRight size={15} className="shrink-0" />
                  </Link>
                )}
              </div>
            )}

            {/* What happened last time — in view before the dial, not five cards deep. */}
            <div>
              <Kicker className="mb-3">Last time</Kicker>
              <div className="space-y-2.5">
                {lead.activities.slice(0, 5).map((a) => (
                  <div key={a.id} className="text-[12px] leading-relaxed">
                    <p className="text-white/30">
                      {new Date(a.createdAt).toLocaleDateString()} · {a.createdBy?.name ?? 'System'}
                    </p>
                    <p className="text-white/65 whitespace-pre-wrap line-clamp-3">{a.content}</p>
                  </div>
                ))}
                {lead.activities.length === 0 && (
                  <p className="text-xs text-white/30">First contact — no history yet.</p>
                )}
              </div>
            </div>

            {/* Only before a call is logged. Afterwards it is the last line
                of the wrap-up card, where it belongs. */}
            {!wrapUp && nextInQueue && nextInQueue.id !== leadId && (
              <Link
                href={`/admin/call/${nextInQueue.id}`}
                className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 transition-colors"
              >
                <span>
                  Next: <span className="text-white">{nextInQueue.company}</span>
                </span>
                <ChevronRight size={15} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/*
        * The bar that knows which of the two moments you are in.
        *
        * This screen is two screens in sequence and only ever admitted to
        * being one. Before the call you want the script; after it you want
        * the outcome buttons — and on a phone, where these calls are actually
        * made, those buttons sat below the entire script and eight objection
        * accordions. Coming back from the dialler meant scrolling past
        * everything you no longer needed to reach the only thing you did,
        * which is a large part of why calls went unlogged.
        *
        * Phone only. On a desktop the actions are already in the right-hand
        * column, permanently in view, and a floating bar would be covering
        * something useful to say what is already on screen.
        */}
      {!wrapUp && lead.phone && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur px-4 py-3">
          {dialled ? (
            <button
              onClick={goToActions}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-3 text-sm font-bold text-black"
            >
              How did it go? Log it
              <ChevronRight size={16} />
            </button>
          ) : (
            <a
              href={`tel:${lead.phone}`}
              onClick={armDial}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-3 text-sm font-bold text-black"
            >
              <Phone size={16} />
              Call {lead.phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
