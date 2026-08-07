'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageIcon, ExternalLink, Compass, Clock, Eye, Flame } from 'lucide-react';
import { Badge, Card, EmptyState, Kicker, PageIn, PageTitle, SearchFilter, matchesSearch } from '@/components/admin/ui';
import { PAIN_POINTS, parseSalesPoints, type PainPointKey } from '@/lib/leads';
import { formatCents } from '@/lib/pricing';
import { MockupDeliveryForm } from '@/components/admin/MockupDelivery';
import { MockupLinkSlot } from '@/components/admin/MockupLinkSlot';
import { SendMockupPanel } from '@/components/admin/SendMockupPanel';
import type { MockupKind } from '@/lib/mockup-kinds';

interface QueueRow {
  id: string;
  company: string;
  contactName: string | null;
  mockupRequestedAt: string | null;
  hotLead: boolean;
  assignedTo: { name: string | null } | null;
  painPoints: string;
  salesNote: string | null;
  originalWebsite: string | null;
  currentSiteAssessment: string | null;
  /** The preview deployment, when a concept already exists. */
  mockupUrl: string | null;
  customPainPoints: string | null;
  essentialPoints: string | null;
  estimateLowCents: number | null;
  estimateHighCents: number | null;
  estimatedValue: number | null;
}

/**
 * Everything needed to actually design the thing, read off the lead's own
 * dossier. Leads with what the mockup has to demonstrate, because that is the
 * promise it exists to make believable.
 */
function MockupBrief({ lead }: { lead: QueueRow }) {
  const essentials = parseSalesPoints(lead.essentialPoints);
  const written = parseSalesPoints(lead.customPainPoints);
  const ticked = lead.painPoints
    .split(',')
    .map((p) => p.trim())
    .filter((p): p is PainPointKey => p in PAIN_POINTS);

  const hasAnything =
    lead.originalWebsite ||
    lead.currentSiteAssessment ||
    essentials.length > 0 ||
    written.length > 0 ||
    ticked.length > 0 ||
    lead.salesNote;
  if (!hasAnything) return null;

  return (
    <div className="mt-3 space-y-3">
      {lead.originalWebsite && (
        <a
          href={lead.originalWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-400/20 transition-colors"
        >
          <Compass size={13} /> Open the site you&apos;re replacing <ExternalLink size={11} />
        </a>
      )}

      {lead.currentSiteAssessment && (
        <div className="rounded-xl bg-white/[0.03] px-3.5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-white/40 font-semibold mb-1">
            What&apos;s wrong with it now
          </p>
          <p className="text-sm text-white/70 leading-relaxed break-words">{lead.currentSiteAssessment}</p>
        </div>
      )}

      {essentials.length > 0 && (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-3.5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-emerald-300/80 font-semibold mb-1.5">
            What the mockup has to show — this is what&apos;s being sold
          </p>
          <ul className="space-y-1">
            {essentials.slice(0, 8).map((e, i) => (
              <li key={i} className="text-sm text-emerald-50/85 leading-relaxed break-words">
                • {e.point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(written.length > 0 || ticked.length > 0) && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-red-300/70 font-semibold mb-1.5">
            Problems found
          </p>
          <div className="flex flex-wrap gap-1.5">
            {written.map((p, i) => (
              <span
                key={`w${i}`}
                className="rounded-md bg-red-400/10 border border-red-400/20 px-2 py-1 text-[11px] text-red-200"
              >
                {p.point}
              </span>
            ))}
            {ticked.map((k) => (
              <span
                key={k}
                className="rounded-md bg-white/[0.05] border border-white/10 px-2 py-1 text-[11px] text-white/55"
              >
                {PAIN_POINTS[k]}
              </span>
            ))}
          </div>
        </div>
      )}

      {lead.salesNote && (
        <p className="text-xs text-sky-200/70 leading-relaxed break-words">
          <span className="font-semibold text-sky-300/80">Note from sales: </span>
          {lead.salesNote}
        </p>
      )}

      {(lead.estimateLowCents || lead.estimatedValue) && (
        <p className="text-xs text-white/40 leading-relaxed">
          <span className="font-semibold text-white/60">Deal size: </span>
          {lead.estimateLowCents && lead.estimateHighCents
            ? `${formatCents(lead.estimateLowCents)} – ${formatCents(lead.estimateHighCents)}`
            : formatCents(lead.estimatedValue ?? lead.estimateLowCents ?? 0)}
          <span className="text-white/25"> — what tells you how much effort this justifies.</span>
        </p>
      )}
    </div>
  );
}

/** Whole days since the request — "waiting since yesterday" beats a raw date. */
function daysWaiting(requestedAt: string | null): number | null {
  if (!requestedAt) return null;
  const ms = Date.now() - new Date(requestedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

interface LiveMockup {
  id: string;
  url: string;
  status: string;
  signal: string;
  viewCount: number;
  responseNote: string | null;
  expired: boolean;
  expiringSoon: boolean;
  sendFailedAt: string | null;
  sendFailedReason: string | null;
  /**
   * How many versions this lead has behind the one on the card.
   *
   * One card per lead now. This tab used to list every version, and a lead
   * picks them up without anybody deciding to make one — the preview build is
   * a version, the client folder is a version, a PDF export is a version — so
   * the same business showed up two and three times with nothing saying why.
   * The count says it in four characters instead.
   */
  versionCount: number;
  lead: {
    id: string;
    company: string;
    contactName: string | null;
    status: string;
    estimatedValue: number | null;
    email: string | null;
    mockupUrl: string | null;
    mockupFolderUrl: string | null;
    /** Marked delivered outside the system — no email, no tracked link. */
    mockupSentManuallyAt?: string | null;
    /** The mockup email written for this lead, if research wrote one. */
    mockupEmailDraft?: string | null;
  };
}

/** A send that failed, whatever the row's status says. */
const FAILED_TONE = 'border-red-400/35 bg-red-400/[0.07]';

/**
 * A live link with days left on it. Amber rather than red: nothing is broken
 * yet, and that is the whole point of saying so now.
 */
const EXPIRING_TONE = 'border-amber-400/35 bg-amber-400/[0.08]';

const LIVE_TONE: Record<string, string> = {
  draft: 'border-amber-400/30 bg-amber-400/[0.06]',
  sent: 'border-sky-400/25 bg-sky-400/[0.05]',
  viewed: 'border-purple-400/30 bg-purple-400/[0.06]',
  approved: 'border-emerald-400/30 bg-emerald-400/[0.06]',
  changes_requested: 'border-amber-400/30 bg-amber-400/[0.06]',
};

export default function MockupQueuePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<QueueRow[]>([]);
  const [live, setLive] = useState<LiveMockup[]>([]);
  const [tab, setTab] = useState<'build' | 'out'>('build');
  const [sendingId, setSendingId] = useState<string | null>(null);
  /** Which card has its send panel open. One at a time — this is a list. */
  const [sendingOpenId, setSendingOpenId] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<{ id: string; tone: 'ok' | 'error'; text: string } | null>(null);
  /** Which lead is being asked "are you sure you sent that yourself?". */
  const [confirmingByHand, setConfirmingByHand] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const load = async () => {
    try {
      const res = await fetch('/api/admin/leads/mockup-queue');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
        setLive(data.live ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The same send the lead page does, from the screen you are already on.
   *
   * `/send-mockup` rather than the per-version route: it sends the *folder*,
   * which is the one link that may go to a client, and it takes an address to
   * send it to instead. Two screens sending two different things under one
   * label is how a password-protected preview reached somebody.
   */
  const sendMockup = async (m: LiveMockup, email?: string, kind?: MockupKind) => {
    setSendingId(m.id);
    setSendNotice(null);
    try {
      const res = await fetch(`/api/admin/leads/${m.lead.id}/send-mockup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(email ? { email } : {}), ...(kind ? { kind } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendNotice({ id: m.id, tone: 'error', text: data.error || 'Could not send it.' });
        return;
      }
      setSendNotice({
        id: m.id,
        tone: data.sent ? 'ok' : 'error',
        text: data.sent
          ? `Sent to ${data.sentTo}${data.emailUpdated ? ' — that is this lead’s address from now on' : ''}. You will see here when they open it.`
          : `Link is ready but the email did not send${data.reason ? ` — ${data.reason}` : ''}. Copy it from the lead and send it by hand.`,
      });
      if (data.sent) setSendingOpenId(null);
      await load();
    } catch {
      setSendNotice({ id: m.id, tone: 'error', text: 'Could not reach the server — try again.' });
    } finally {
      setSendingId(null);
    }
  };

  /**
   * Delivered, just not through here.
   *
   * Takes the lead off the build queue without pretending an email went from
   * this system. Two clicks rather than one: a stray press removes work from
   * the only list that would have reminded anybody it existed.
   */
  const markSentByHand = async (leadId: string) => {
    setSendingId(leadId);
    setSendNotice(null);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/mockup-sent-by-hand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSendNotice({ id: leadId, tone: 'error', text: data?.error ?? 'Could not record that.' });
        return;
      }
      setConfirmingByHand(null);
      await load();
    } finally {
      setSendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading the mockup queue…</p>
      </div>
    );
  }

  const visible = leads.filter((l) => matchesSearch(search, l.company, l.contactName));
  // Approved and "changes asked" float up: both are somebody waiting on a
  // reply, and both go cold in a day.
  const liveVisible = [...live]
    .filter((m) => matchesSearch(search, m.lead.company, m.lead.contactName))
    .sort((a, b) => {
      /*
       * A send that failed outranks everything: the client has heard nothing,
       * and one click fixes it.
       *
       * A live link about to die comes next, above even an approval. It is
       * the only row here with a DEADLINE on it — everything else can wait
       * until tomorrow and be exactly as true, while this one turns into a
       * prospect clicking a dead link we sent them. Re-sending resets the
       * clock, which is the button already on the row.
       */
      const rank = (m: LiveMockup) =>
        m.sendFailedAt
          ? -2
          : m.expiringSoon
            ? -1
            : m.status === 'draft'
              ? 0
              : m.status === 'approved'
                ? 1
                : m.status === 'changes_requested'
                  ? 2
                  : m.status === 'viewed'
                    ? 3
                    : 4;
      return rank(a) - rank(b);
    });
  // Named rather than inlined: the summary line at the top of the page says
  // how many, and the count has to be the one the list is actually showing.
  const failedCount = liveVisible.filter((m) => m.sendFailedAt).length;
  /*
   * Live links about to die. Worth the top of the page because it is the one
   * thing here with a deadline: everything else is as true tomorrow, and this
   * turns into a prospect clicking a dead link we sent them.
   */
  const expiringCount = liveVisible.filter((m) => m.expiringSoon && !m.sendFailedAt).length;
  const sortedByWait = [...visible].sort((a, b) => {
    if (a.hotLead !== b.hotLead) return a.hotLead ? -1 : 1;
    return (daysWaiting(a.mockupRequestedAt) ?? 0) - (daysWaiting(b.mockupRequestedAt) ?? 0) > 0 ? -1 : 1;
  });

  return (
    <PageIn className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-1">
        <Kicker className="mb-2">Sales</Kicker>
        <PageTitle icon={ImageIcon} title="Mockups" />
        <p className="text-sm text-white/45 mt-1">
          {tab === 'build'
            ? leads.length === 0
              ? 'Nothing waiting on a mockup right now.'
              : `${leads.length} ${leads.length === 1 ? 'lead is' : 'leads are'} waiting on a mockup, longest-waiting and hot leads first.`
            : liveVisible.length === 0
              ? 'Nothing built yet. Attach a mockup above and it lands here ready to send.'
              : failedCount > 0
                ? `${failedCount} did not reach anybody — those are at the top. Then unsent, then anything the client has opened.`
                : expiringCount > 0
                  ? `${expiringCount} ${expiringCount === 1 ? 'link stops' : 'links stop'} working within the week — those are at the top. Re-send to reset the clock.`
                  : `${liveVisible.length} built. Unsent first, then anything the client has opened — those are warm, ring them.`}
        </p>
      </div>

      {/* Two halves of one job. This page was named after mockups but only
          ever listed the ones still to build, so the moment a mockup was
          delivered it left the only screen named after it — and whether the
          client had opened it was nobody's screen at all. */}
      <div
        role="tablist"
        aria-label="Mockup views"
        className="mt-4 inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1"
      >
        {(
          [
            ['build', 'To build', leads.length],
            ['out', 'Built', live.length],
          ] as Array<['build' | 'out', string, number]>
        ).map(([key, label, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'bg-white/[0.09] text-white' : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
            }`}
          >
            {label}
            {count > 0 && <span className="text-xs text-white/35">{count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-5 mb-5">
        <SearchFilter
          value={search}
          onChange={setSearch}
          placeholder="Find a business..."
          count={visible.length}
          total={leads.length}
        />
      </div>

      {tab === 'out' ? (
        <div className="space-y-2">
          {liveVisible.length === 0 && (
            <Card className="p-4">
              <EmptyState icon={Eye} text="Nothing built yet." tone="clear" />
            </Card>
          )}
          {liveVisible.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border p-4 ${
                m.sendFailedAt
                  ? FAILED_TONE
                  : m.expiringSoon
                    ? EXPIRING_TONE
                    : LIVE_TONE[m.status] ?? 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/leads/${m.lead.id}`}
                    className="text-sm font-bold text-white/90 hover:underline break-words inline-flex items-center gap-1.5"
                  >
                    {m.lead.company}
                    <ExternalLink size={11} className="opacity-40" />
                  </Link>
                  {/* The history, said on the one card rather than shown as
                      extra copies of the business. */}
                  {m.versionCount > 1 && (
                    <span className="ml-2 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/40">
                      {m.versionCount} versions
                    </span>
                  )}
                  <p
                    className={`text-xs mt-0.5 ${
                      m.sendFailedAt ? 'text-red-300' : m.expiringSoon ? 'text-amber-200' : 'text-white/55'
                    }`}
                  >
                    {m.signal}
                  </p>
                  {/* The provider's own words. "Domain is not verified" names
                      the fix; "could not send" sends somebody hunting. */}
                  {m.sendFailedAt && m.sendFailedReason && (
                    <p className="mt-1 text-xs text-white/45">{m.sendFailedReason}</p>
                  )}
                  {m.responseNote && (
                    <p className="mt-2 text-xs italic text-white/60">&ldquo;{m.responseNote}&rdquo;</p>
                  )}
                  {/* Only when the panel is closed, which is where the same
                      notice renders while it is open. */}
                  {sendNotice?.id === m.id && sendingOpenId !== m.id && (
                    <p
                      className={`mt-1.5 text-xs ${
                        sendNotice.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {sendNotice.text}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.lead.estimatedValue ? (
                    <span className="text-xs text-white/35">{formatCents(m.lead.estimatedValue)}</span>
                  ) : null}
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/5 transition-colors"
                  >
                    Open
                  </a>
                  {/* Sendable from here whatever state it is in, because this
                      is the screen you are on when you finish building one —
                      and the screen you come back to when a client says they
                      never got it.

                      It used to appear only on an unsent or expired mockup,
                      which meant the two cases that most need it — "sent, not
                      opened" and "sent to the wrong inbox" — had no button at
                      all, and the only way to send again was the lead page.
                      "Never opened" is precisely when somebody wants to try
                      the owner's own address. */}
                  <button
                    type="button"
                    onClick={() => {
                      setSendNotice(null);
                      setSendingOpenId(sendingOpenId === m.id ? null : m.id);
                    }}
                    aria-expanded={sendingOpenId === m.id}
                    className={
                      m.sendFailedAt || m.status === 'draft' || m.expired
                        ? 'rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 transition-opacity'
                        : 'rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/5 transition-colors'
                    }
                  >
                    {sendingOpenId === m.id
                      ? 'Cancel'
                      : m.sendFailedAt
                        ? 'Try again'
                        : m.status === 'draft'
                          ? 'Send to client'
                          : 'Send again'}
                  </button>
                  {/* Same third state as the build queue: this one went out by
                      hand, so stamp it rather than sending a second copy. */}
                  {m.status === 'draft' && !m.lead.mockupSentManuallyAt && (
                    <button
                      type="button"
                      onClick={() =>
                        confirmingByHand === m.lead.id
                          ? markSentByHand(m.lead.id)
                          : setConfirmingByHand(m.lead.id)
                      }
                      disabled={sendingId === m.lead.id}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                        confirmingByHand === m.lead.id
                          ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                          : 'border-white/15 text-white/50 hover:bg-white/5'
                      }`}
                    >
                      {sendingId === m.lead.id
                        ? 'Recording…'
                        : confirmingByHand === m.lead.id
                          ? 'Sure? Nothing gets emailed'
                          : 'Sent it myself'}
                    </button>
                  )}
                </div>
              </div>

              {/* Opened rather than sent on the first click, deliberately.
                  Re-mailing a client is not undoable, and the address is the
                  decision worth making here — the panel is where a rep uses
                  the owner's own number-off-a-call address instead of the
                  info@ this probably went to the first time. */}
              {sendingOpenId === m.id && (
                <div className="mt-3">
                  <SendMockupPanel
                    recipientName={m.lead.contactName}
                    company={m.lead.company}
                    emailOnFile={m.lead.email}
                    sending={sendingId === m.id}
                    notice={
                      sendNotice?.id === m.id
                        ? { tone: sendNotice.tone === 'ok' ? 'ok' : 'warn', text: sendNotice.text }
                        : null
                    }
                    onSend={(email, kind) => sendMockup(m, email, kind)}
                    resend={m.status !== 'draft'}
                    written={Boolean(m.lead.mockupEmailDraft)}
                  />
                </div>
              )}

              {/* Both links, on the page named after them. Managing them only
                  from the lead detail meant opening a second screen to check
                  which link was which — and the folder is the one that goes
                  to the client, so getting it wrong is not a small mistake. */}
              <div className="mt-3 space-y-2">
                <MockupLinkSlot
                  leadId={m.lead.id}
                  field="mockupFolderUrl"
                  value={m.lead.mockupFolderUrl}
                  label="Mockup folder"
                  tone="send"
                  hint="The Drive folder the client gets — screenshots, the brochure, the walkthrough video. The only link that goes in an email."
                  placeholder="drive.google.com/drive/folders/..."
                  onSaved={load}
                />
                <MockupLinkSlot
                  leadId={m.lead.id}
                  field="mockupUrl"
                  value={m.lead.mockupUrl}
                  label="Preview build"
                  tone="internal"
                  hint="The Vercel subdomain, for pulling up quickly on a call. Password-protected, so it is never sent."
                  placeholder="company.bothmade.studio"
                  onSaved={load}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
      {sortedByWait.length === 0 && !search && (
        <Card className="p-4">
          <EmptyState icon={ImageIcon} text="Nothing waiting on a mockup right now." tone="clear" />
        </Card>
      )}

      <div className="space-y-3">
        {sortedByWait.map((lead) => {
          const days = daysWaiting(lead.mockupRequestedAt);
          return (
            <div
              key={lead.id}
              className={`rounded-xl border p-4 min-w-0 ${
                lead.hotLead ? 'border-amber-400/25 bg-amber-400/[0.04]' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="text-sm font-bold text-white/90 hover:underline break-words inline-flex items-center gap-1.5"
                  >
                    {lead.hotLead && <Flame size={13} className="text-amber-300 shrink-0" aria-label="Hot lead" />} {lead.company}
                    <ExternalLink size={11} className="opacity-40" />
                  </Link>
                  <p className="text-xs text-white/40 mt-0.5">
                    {days === null
                      ? 'Requested recently'
                      : days === 0
                      ? 'Requested today'
                      : `Waiting ${days} ${days === 1 ? 'day' : 'days'}`}
                    {lead.assignedTo?.name ? ` · ${lead.assignedTo.name}` : ''}
                  </p>
                </div>
                {days !== null && days >= 3 && (
                  <span className="shrink-0">
                    <Badge tone="red" solid>
                      <Clock size={11} className="inline align-[-1px] mr-1" aria-hidden="true" />
                      {days} days — sales is blocked
                    </Badge>
                  </span>
                )}
              </div>

              <MockupBrief lead={lead} />

              <div className="mt-4 pt-4 border-t border-white/[0.08]">
                {/* A concept can exist while the deliverable does not. Saying
                    so is the difference between "start from nothing" and
                    "assemble the folder from the build that is already up". */}
                {lead.mockupUrl && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
                      Concept already up
                    </span>
                    <a
                      href={lead.mockupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs text-white/60 hover:text-white/90 transition-colors"
                    >
                      {lead.mockupUrl.replace(/^https?:\/\//, '')}
                    </a>
                    <span className="text-xs text-amber-300/80">— client folder still needed</span>
                  </div>
                )}

                <MockupDeliveryForm
                  leadId={lead.id}
                  onDelivered={load}
                  field="mockupFolderUrl"
                  submitLabel="Attach folder"
                  placeholder="drive.google.com/drive/folders/..."
                />

                {/* The third state.
                    The send button mails the folder on a tracked link and
                    says the mockup is "a working preview, not a picture of
                    one" — true almost every time, and once it was not, so
                    the right call was a written email and the button was
                    deliberately not pressed. That left finished work sitting
                    here as outstanding forever, because the only thing that
                    could clear it was the button that should not have been
                    used. Two clicks, because a stray press removes work from
                    the one list that would have reminded anybody it existed. */}
                <div className="mt-3 border-t border-white/[0.06] pt-3">
                  {confirmingByHand === lead.id ? (
                    <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3">
                      <p className="text-xs text-white/70">
                        This takes {lead.company} off the queue without sending anything. Use it when
                        you have already sent the mockup yourself — there will be no tracked link, so
                        nothing will record them opening it.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => markSentByHand(lead.id)}
                          disabled={sendingId === lead.id}
                          className="rounded-lg bg-amber-400/90 px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
                        >
                          {sendingId === lead.id ? 'Recording…' : 'Yes — I sent it myself'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingByHand(null)}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      </div>
                      {sendNotice?.id === lead.id && sendNotice.tone === 'error' && (
                        <p className="mt-2 text-xs text-red-300">{sendNotice.text}</p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingByHand(lead.id)}
                      className="text-xs text-white/40 transition-colors hover:text-white/70"
                    >
                      Already sent this one yourself? Mark it done →
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
        </>
      )}
    </PageIn>
  );
}
