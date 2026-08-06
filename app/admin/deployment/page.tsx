'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ExternalLink, Globe, Rocket, ShieldCheck } from 'lucide-react';
import { Card, EmptyState, Kicker, PageIn, PageTitle } from '@/components/admin/ui';
import { LANE_COPY, domainAccessLabel, type LaunchLane } from '@/lib/launch';

/**
 * The launch board.
 *
 * Going live was one text box on a project page holding the finished URL.
 * Everything around it lived in somebody's head: whether we can actually get
 * into the DNS, whether the forms have been tested against a real inbox,
 * whether the preview's noindex came off, whether Payment 3 cleared — which
 * Section 7 makes the condition of launching at all — and when the thirty-day
 * warranty runs out, which the launch email has been announcing for months
 * against nothing that knew the answer.
 *
 * Three lanes rather than a list, because the question this screen answers is
 * "what can I ship today". Live projects stay on it: the warranty is running
 * on those, and it is the part of a launch nobody was watching.
 */

interface Blocker {
  key: string;
  label: string;
  reason: string;
}

interface BoardRow {
  id: string;
  name: string;
  status: string;
  liveUrl: string | null;
  domainName: string | null;
  domainAccess: string | null;
  hostingProvider: string | null;
  readyForLaunchAt: string | null;
  launchedAt: string | null;
  handoverAt: string | null;
  lane: LaunchLane;
  readiness: {
    done: number;
    total: number;
    percent: number;
    blockers: Blocker[];
    optionalLeft: string[];
    ready: boolean;
    line: string;
  };
  warranty: { active: boolean; daysLeft: number; clientLine: string };
  finalInstalment: { label: string; status: string; amountCents: number } | null;
  client: { id: string; company: string; contactName: string | null; email: string };
}

const LANE_ORDER: LaunchLane[] = ['ready', 'preparing', 'live'];

const LANE_TONE: Record<LaunchLane, string> = {
  ready: 'border-emerald-400/30 bg-emerald-400/[0.05]',
  preparing: 'border-white/[0.08] bg-white/[0.02]',
  live: 'border-sky-400/25 bg-sky-400/[0.04]',
};

/** The progress ring. A number in a circle beats a number beside a label. */
function Ring({ percent, tone }: { percent: number; tone: string }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/[0.07]" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * percent) / 100}
          className={`${tone} transition-[stroke-dashoffset] duration-700`}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums text-white/60">{percent}</span>
    </span>
  );
}

export default function DeploymentPage() {
  const router = useRouter();
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/deployment');
        if (res.status === 401) {
          router.push('/admin/login');
          return;
        }
        const data = await res.json();
        if (!cancelled && data?.success) setRows(data.projects ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading the launch board…</p>
      </div>
    );
  }

  const lanes = LANE_ORDER.map((lane) => ({ lane, rows: rows.filter((r) => r.lane === lane) }));
  const shippable = rows.filter((r) => r.lane !== 'live' && r.readiness.ready).length;
  const warrantyRunning = rows.filter((r) => r.warranty.active).length;

  return (
    <PageIn className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6">
        <Kicker className="mb-2">Delivery</Kicker>
        <PageTitle icon={Rocket} title="Deployment" />
        <p className="mt-1 text-sm text-white/45">
          {rows.length === 0
            ? 'Nothing is close enough to launch to be worth watching yet.'
            : shippable > 0
              ? `${shippable} ${shippable === 1 ? 'project is' : 'projects are'} clear to go live right now.`
              : 'Nothing is clear to go live yet — every project below has something in the way.'}
          {warrantyRunning > 0 &&
            ` ${warrantyRunning} ${warrantyRunning === 1 ? 'site is' : 'sites are'} inside the warranty period.`}
        </p>
      </div>

      {rows.length === 0 && (
        <Card className="p-4">
          <EmptyState
            icon={Rocket}
            text="Projects appear here once they reach Build. Nothing has yet."
            tone="clear"
          />
        </Card>
      )}

      <div className="space-y-8">
        {lanes.map(({ lane, rows: laneRows }) =>
          laneRows.length === 0 ? null : (
            <section key={lane}>
              <h2 className="text-sm font-bold text-white/85">
                {LANE_COPY[lane].title}
                <span className="ml-2 text-xs font-normal text-white/30">{laneRows.length}</span>
              </h2>
              <p className="mb-3 mt-0.5 text-xs text-white/35">{LANE_COPY[lane].blurb}</p>

              <div className="space-y-2.5">
                {laneRows.map((row) => (
                  <Link
                    key={row.id}
                    href={`/admin/deployment/${row.id}`}
                    className={`block rounded-xl border p-4 transition-colors hover:border-white/25 ${LANE_TONE[lane]}`}
                  >
                    <div className="flex items-start gap-3.5">
                      <Ring
                        percent={row.readiness.percent}
                        tone={
                          lane === 'live'
                            ? 'text-sky-400'
                            : row.readiness.ready
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                        }
                      />

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-white/90">
                          {row.client.company}
                          <span className="text-xs font-normal text-white/35">{row.name}</span>
                        </p>

                        <p
                          className={`mt-0.5 flex items-center gap-1.5 text-xs ${
                            lane === 'live'
                              ? 'text-sky-200/80'
                              : row.readiness.ready
                                ? 'text-emerald-300'
                                : 'text-amber-200/90'
                          }`}
                        >
                          {lane === 'live' ? (
                            <>
                              <CheckCircle2 size={12} />
                              {row.warranty.active
                                ? `Live — ${row.warranty.daysLeft} days of warranty left`
                                : 'Live — warranty period has ended'}
                            </>
                          ) : row.readiness.ready ? (
                            <>
                              <CheckCircle2 size={12} />
                              {row.readiness.line}
                            </>
                          ) : (
                            <>
                              <AlertTriangle size={12} />
                              {row.readiness.line}
                            </>
                          )}
                        </p>

                        {/* The blockers by name. "3 things in the way" makes
                            somebody open the project to find out which; saying
                            them here is what makes the board usable from across
                            the room. */}
                        {lane !== 'live' && row.readiness.blockers.length > 0 && (
                          <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
                            {row.readiness.blockers
                              .slice(0, 3)
                              .map((b) => b.label)
                              .join(' · ')}
                            {row.readiness.blockers.length > 3 &&
                              ` · and ${row.readiness.blockers.length - 3} more`}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/30">
                          <span className="inline-flex items-center gap-1">
                            <Globe size={10} />
                            {row.domainName || 'no domain recorded'}
                            {row.domainName && row.domainAccess && (
                              <span className="text-white/20">
                                {' '}
                                · {domainAccessLabel(row.domainAccess)}
                              </span>
                            )}
                          </span>
                          {row.hostingProvider && <span>{row.hostingProvider}</span>}
                          {row.handoverAt && (
                            <span className="inline-flex items-center gap-1 text-emerald-300/50">
                              <ShieldCheck size={10} /> handed over
                            </span>
                          )}
                        </div>
                      </div>

                      {row.liveUrl && (
                        <span className="hidden shrink-0 items-center gap-1 rounded-lg border border-white/12 px-2.5 py-1.5 text-[11px] text-white/60 sm:inline-flex">
                          Open <ExternalLink size={10} />
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )
        )}
      </div>
    </PageIn>
  );
}
