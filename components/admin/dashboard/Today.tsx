'use client';

import { useEffect, useState } from 'react';
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
  PhoneCall,
  Wrench,
} from 'lucide-react';
import { formatCents } from '@/lib/pricing';

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
      updatedAt: string;
    }>;
    callsToday: number;
  };
  money: {
    dueInstalments: Array<{
      id: string;
      label: string;
      amountCents: number;
      dueAt: string | null;
      invoiceNumber: string | null;
      project: { id: string; name: string; client: { company: string } };
    }>;
    scheduledTotalCents: number;
    scheduledCount: number;
    unpaidInvoices: Array<{
      id: string;
      number: string;
      description: string;
      amountCents: number;
      createdAt: string;
      client: { company: string };
      project: { id: string };
    }>;
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
}: {
  href: string;
  title: string;
  detail: string;
  right?: string;
  tone?: 'neutral' | 'hot' | 'good' | 'warn';
}) {
  const tones = {
    neutral: 'border-white/[0.06] hover:border-white/15',
    hot: 'border-purple-400/25 bg-purple-400/[0.05] hover:border-purple-400/45',
    good: 'border-emerald-400/25 bg-emerald-400/[0.05] hover:border-emerald-400/45',
    warn: 'border-amber-400/25 bg-amber-400/[0.05] hover:border-amber-400/45',
  };
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${tones[tone]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white">{title}</p>
        <p className="truncate text-[11px] text-white/40">{detail}</p>
      </div>
      {right && <span className="shrink-0 text-[12px] tabular-nums text-white/50">{right}</span>}
      <ArrowRight size={13} className="shrink-0 text-white/15 group-hover:text-white/40 transition-colors" />
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

export function Today() {
  const router = useRouter();
  const [data, setData] = useState<TodayData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/admin/today')
      .then((res) => {
        if (res.status === 401) {
          router.push('/admin/login');
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((body) => {
        if (body?.success) setData(body);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [router]);

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
    if (sell.approvedMockups.length > 0) {
      return {
        text: `${sell.approvedMockups[0].lead.company} approved their mockup. Send the proposal.`,
        href: `/admin/leads/${sell.approvedMockups[0].lead.id}`,
        cta: 'Open the deal',
      };
    }
    if (money.dueInstalments.length > 0) {
      const total = money.dueInstalments.reduce((s, i) => s + i.amountCents, 0);
      return {
        text: `${formatCents(total)} invoiced and unpaid across ${money.dueInstalments.length} payment${
          money.dueInstalments.length === 1 ? '' : 's'
        }.`,
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
      return {
        text: `${sell.overdueFollowUps.length} follow-up${
          sell.overdueFollowUps.length === 1 ? ' is' : 's are'
        } overdue.`,
        href: '/admin/call',
        cta: 'Start calling',
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
              detail={`Proposal sent ${daysSince(l.updatedAt)}d ago, unsigned`}
              right={l.proposalTotalPrice ? formatCents(l.proposalTotalPrice) : undefined}
            />
          ))}
          {sell.approvedMockups.length +
            sell.openedMockups.length +
            sell.overdueFollowUps.length +
            sell.unsignedProposals.length ===
            0 && <Quiet text="Nobody is waiting on you." />}

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
              href="/admin/call"
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
          {money.dueInstalments.map((i) => (
            <Row
              key={i.id}
              href={`/admin/projects/${i.project.id}`}
              title={`${i.project.client.company} — ${i.label}`}
              detail={
                i.dueAt
                  ? new Date(i.dueAt) < new Date()
                    ? `Overdue ${daysSince(i.dueAt)}d${i.invoiceNumber ? ` · ${i.invoiceNumber}` : ''}`
                    : `Due ${new Date(i.dueAt).toLocaleDateString()}`
                  : 'Invoiced'
              }
              right={formatCents(i.amountCents)}
              tone={i.dueAt && new Date(i.dueAt) < new Date() ? 'warn' : 'neutral'}
            />
          ))}
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

          <div className="mt-1 grid grid-cols-2 gap-1.5 pt-1">
            <div className="rounded-xl border border-white/[0.06] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/30">In this month</p>
              <p className="text-sm font-semibold text-emerald-300">
                {formatCents(money.collectedThisMonthCents)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] px-3 py-2" title="Not yet invoiced — waiting on a gate">
              <p className="text-[10px] uppercase tracking-wide text-white/30">Still to come</p>
              <p className="text-sm font-semibold text-white/70">
                {formatCents(money.scheduledTotalCents)}
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
          {deliver.stalledProjects.map((p) => (
            <Row
              key={p.id}
              href={`/admin/projects/${p.id}`}
              title={p.client.company}
              detail={`${p.status} · untouched ${daysSince(p.updatedAt)}d`}
              tone="warn"
            />
          ))}
          {deliver.stalledProjects.length === 0 && <Quiet text="Every project moved this week." />}

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
