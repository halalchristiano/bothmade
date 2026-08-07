'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Globe,
  Lock,
  Rocket,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { finalInstalment } from '@/lib/instalments';
import { BrandButton, Kicker, PageIn, PageTitle, inputClass } from '@/components/admin/ui';
import {
  DOMAIN_ACCESS,
  LAUNCH_CHECKS,
  LAUNCH_GROUPS,
  launchReadiness,
  readChecklist,
  warrantyState,
  type LaunchChecklist,
} from '@/lib/launch';

/**
 * One project's road to going live.
 *
 * The checks are the things that make a launch fail in practice — a form
 * posting into a void, a redirect nobody set, a preview whose noindex was
 * never taken off. None of them are hard. All of them are things you remember
 * at eleven at night.
 *
 * The two buttons at the bottom are the contract. "Confirm ready for launch"
 * is the written confirmation Section 1 defines the phrase by, and the thing
 * that makes Payment 3 due under Section 7 — it existed as a definition with
 * nowhere to happen. Going live keeps its old home on the project page,
 * because that is the button that mails the client and it belongs behind the
 * same guard as every other send.
 */

interface DeploymentProject {
  id: string;
  name: string;
  status: string;
  liveUrl: string | null;
  domainName: string | null;
  domainRegistrar: string | null;
  domainAccess: string | null;
  hostingProvider: string | null;
  dnsNote: string | null;
  launchChecklist: unknown;
  readyForLaunchAt: string | null;
  launchedAt: string | null;
  warrantyEndsAt: string | null;
  handoverAt: string | null;
  client: { id: string; company: string; contactName: string | null; email: string };
  instalments?: Array<{ index: number; label: string; status: string; amountCents: number }>;
}

export default function DeploymentDetailPage() {
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<DeploymentProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Domain fields are a form, not a live field — typing a hostname one
  // character at a time should not be twelve writes.
  const [domain, setDomain] = useState({
    domainName: '',
    domainRegistrar: '',
    domainAccess: '',
    hostingProvider: '',
    dnsNote: '',
  });
  const [domainDirty, setDomainDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (data?.success && data.project) {
        setProject(data.project);
        setDomain({
          domainName: data.project.domainName ?? '',
          domainRegistrar: data.project.domainRegistrar ?? '',
          domainAccess: data.project.domainAccess ?? '',
          hostingProvider: data.project.hostingProvider ?? '',
          dnsNote: data.project.dnsNote ?? '',
        });
        setDomainDirty(false);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Don't let the DNS notes go without asking.
   *
   * Everything else on this page saves the instant it is pressed — the
   * checklist ticks PATCH on click. The domain block is the one section
   * behind an explicit Save, and it is also the one holding free text:
   * "MX records point at Microsoft 365 — do not touch them. Cutover agreed
   * for Tuesday morning." That is written once, from a phone call, at the
   * point somebody finally got hold of the client's IT company, and the
   * button that loses it is the "← Launch board" link three inches above it.
   *
   * beforeunload covers the tab being closed or reloaded; the link guards
   * below cover the in-app navigations, which are the likely ones. Both, or
   * it only half works.
   */
  useEffect(() => {
    if (!domainDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers show their own wording now and ignore ours; assigning
      // returnValue is still what marks the event as wanting the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [domainDirty]);

  /**
   * Stops an in-app link when the domain block has unsaved edits.
   *
   * Deliberately a confirm rather than a block: somebody who genuinely wants
   * to leave should get to leave on the second press, not be held on a page
   * by a note they no longer want.
   */
  const confirmLeave = (e: React.MouseEvent) => {
    if (!domainDirty) return;
    const ok = window.confirm(
      'The domain and DNS notes have not been saved. Leave the page and lose them?'
    );
    if (!ok) e.preventDefault();
  };

  const patch = async (body: Record<string, unknown>, busyKey: string) => {
    setSaving(busyKey);
    setError('');
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/deployment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Could not save that.');
        return;
      }
      await load();
    } catch {
      setError('Could not reach the server — try again.');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <PageIn className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-white/50">That project could not be loaded.</p>
        <Link href="/admin/deployment" className="mt-3 inline-block text-sm text-sky-300">
          ← Back to the launch board
        </Link>
      </PageIn>
    );
  }

  const checklist: LaunchChecklist = readChecklist(project.launchChecklist);
  const instalments = (project.instalments ?? []).filter((i) => i.status !== 'void');
  /*
   * Same rule as the launch board, from the same helper.
   *
   * This page happened to be right — the API behind it orders by index — but
   * it was right by luck rather than by construction, reading the last row of
   * whatever array it was handed. The board did the identical thing against a
   * query with no ORDER BY and reached the opposite verdict on the same
   * project. One of them being accidentally correct is not a state worth
   * leaving in place.
   */
  const finalRow = finalInstalment(project.instalments ?? []);
  const readiness = launchReadiness(checklist, {
    finalInstalmentPaid: finalRow ? finalRow.status === 'paid' : true,
    hasSchedule: instalments.length > 0,
    domainName: domain.domainName,
  });
  const warranty = warrantyState(project.warrantyEndsAt);
  const live = Boolean(project.liveUrl);

  return (
    <PageIn className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/admin/deployment"
        onClick={confirmLeave}
        className="mb-5 inline-block text-sm text-white/45 transition-colors hover:text-white"
      >
        ← Launch board
      </Link>

      <Kicker className="mb-2">Deployment</Kicker>
      <PageTitle icon={Rocket} title={project.client.company} />
      <p className="mt-1 text-sm text-white/45">
        {project.name} ·{' '}
        <Link
          href={`/admin/projects/${project.id}`}
          onClick={confirmLeave}
          className="text-sky-300 hover:underline"
        >
          open the project
        </Link>
      </p>

      {/* Where this stands, before anything else on the page. */}
      <div
        className={`mt-6 rounded-2xl border p-5 ${
          live
            ? 'border-sky-400/30 bg-sky-400/[0.06]'
            : readiness.ready
              ? 'border-emerald-400/30 bg-emerald-400/[0.06]'
              : 'border-amber-400/30 bg-amber-400/[0.06]'
        }`}
      >
        <p
          className={`flex items-center gap-2 text-base font-bold ${
            live ? 'text-sky-200' : readiness.ready ? 'text-emerald-200' : 'text-amber-200'
          }`}
        >
          {live ? <CheckCircle2 size={17} /> : readiness.ready ? <Rocket size={16} /> : <AlertTriangle size={16} />}
          {live
            ? 'Live'
            : readiness.ready
              ? 'Clear to go live'
              : `${readiness.blockers.length} thing${readiness.blockers.length === 1 ? '' : 's'} in the way`}
        </p>

        {live && project.liveUrl && (
          <a
            href={project.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-white/80 hover:underline"
          >
            {project.liveUrl}
            <ExternalLink size={12} className="opacity-50" />
          </a>
        )}

        {!live && readiness.blockers.length > 0 && (
          <ul className="mt-3 space-y-2">
            {readiness.blockers.map((b) => (
              <li key={b.key}>
                <p className="text-sm font-medium text-white/85">{b.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/45">{b.reason}</p>
              </li>
            ))}
          </ul>
        )}

        {!live && readiness.ready && (
          <p className="mt-2 text-xs leading-relaxed text-white/50">
            Every blocking check is done and the money has cleared. Set the live URL on the project
            page — that is the button that emails the client, so it stays behind the same
            confirmation as every other send.
          </p>
        )}

        {live && (
          <p className="mt-2 text-xs leading-relaxed text-white/50">
            {warranty.active
              ? `Warranty runs for another ${warranty.daysLeft} day${warranty.daysLeft === 1 ? '' : 's'}, to ${warranty.endsAt?.toLocaleDateString()}. Anything not matching the agreed scope is fixed at no charge until then — Section 16.`
              : project.warrantyEndsAt
                ? `The 30-day warranty ended on ${warranty.endsAt?.toLocaleDateString()}. Section 16 puts anything after that outside the obligation to fix, absent a care plan.`
                : 'No launch date recorded, so the warranty has no end date. It was launched before this page existed.'}
          </p>
        )}

        <div className="mt-3.5 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${
                readiness.ready ? 'bg-emerald-400' : 'bg-gradient-to-r from-amber-400 to-sky-400'
              }`}
              style={{ width: `${readiness.percent}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-white/35">
            {readiness.done}/{readiness.total}
          </span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {/* --- The domain ----------------------------------------------------- */}
      <section className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Globe size={15} className="text-sky-300" />
          The domain
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/40">
          A launch fails on DNS more often than on anything we build. What we knew about the domain
          was a free-text onboarding answer nobody read again.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs text-white/50">Domain going live</span>
            <input
              value={domain.domainName}
              onChange={(e) => {
                setDomain((d) => ({ ...d, domainName: e.target.value }));
                setDomainDirty(true);
              }}
              placeholder="havis.co.uk"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-white/50">Registered with</span>
            <input
              value={domain.domainRegistrar}
              onChange={(e) => {
                setDomain((d) => ({ ...d, domainRegistrar: e.target.value }));
                setDomainDirty(true);
              }}
              placeholder="GoDaddy, 123-reg, Cloudflare…"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-white/50">Hosted on</span>
            <input
              value={domain.hostingProvider}
              onChange={(e) => {
                setDomain((d) => ({ ...d, hostingProvider: e.target.value }));
                setDomainDirty(true);
              }}
              placeholder="Vercel, Netlify, their existing host…"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-white/50">Who can change the DNS</span>
            <select
              value={domain.domainAccess}
              onChange={(e) => {
                setDomain((d) => ({ ...d, domainAccess: e.target.value }));
                setDomainDirty(true);
              }}
              className={inputClass}
            >
              <option value="">Nobody has checked</option>
              {DOMAIN_ACCESS.filter((d) => d.value !== 'unknown').map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs text-white/50">
            Anything the next person needs to know
          </span>
          <textarea
            value={domain.dnsNote}
            onChange={(e) => {
              setDomain((d) => ({ ...d, dnsNote: e.target.value }));
              setDomainDirty(true);
            }}
            rows={3}
            placeholder="MX records point at Microsoft 365 — do not touch them. Cutover agreed for Tuesday morning."
            className={`${inputClass} resize-none`}
          />
        </label>

        {/* Deliberately not a password field. Credentials do not belong in a
            database we would then have to defend — this is where they live,
            not what they are. */}
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-white/30">
          <Lock size={11} className="mt-0.5 shrink-0" />
          Where things live, not the passwords to them. Those stay in the password manager.
        </p>

        {domainDirty && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <BrandButton onClick={() => patch(domain, 'domain')} disabled={saving === 'domain'}>
              {saving === 'domain' ? 'Saving…' : 'Save'}
            </BrandButton>
            {/* A button appearing is a weak signal for "you have unsaved work" —
                it reads as an affordance, not a warning. Everything else here
                writes on click, so this block is the only place on the page
                where leaving costs you something. */}
            <p role="status" className="text-xs text-amber-200/80">
              Not saved yet.
            </p>
          </div>
        )}
      </section>

      {/* --- The checklist -------------------------------------------------- */}
      <section className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Server size={15} className="text-sky-300" />
          Before it goes live
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/40">
          Whether the final payment has cleared is not on this list — the system already knows, and
          a box saying the money arrived is a box somebody ticks optimistically on a Friday.
        </p>

        <div className="mt-4 space-y-6">
          {LAUNCH_GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-2 text-[10px] uppercase tracking-wide text-white/30">{group}</p>
              <div className="space-y-1.5">
                {LAUNCH_CHECKS.filter((c) => c.group === group).map((check) => {
                  const state = checklist[check.key];
                  const done = Boolean(state?.done);
                  return (
                    <button
                      key={check.key}
                      type="button"
                      onClick={() => patch({ check: check.key, done: !done }, check.key)}
                      disabled={saving === check.key}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                        done
                          ? 'border-emerald-400/25 bg-emerald-400/[0.05]'
                          : check.blocking
                            ? 'border-amber-400/20 bg-white/[0.02] hover:border-amber-400/40'
                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {done ? (
                          <CheckCircle2 size={16} className="text-emerald-300" />
                        ) : (
                          <Circle size={16} className={check.blocking ? 'text-amber-300/60' : 'text-white/20'} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-sm font-medium ${done ? 'text-white/60 line-through' : 'text-white/85'}`}
                          >
                            {check.label}
                          </span>
                          {check.blocking && !done && (
                            <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">
                              blocking
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-white/40">
                          {check.hint}
                        </span>
                        {done && state?.by && (
                          <span className="mt-1 block text-[11px] text-emerald-300/50">
                            {state.by}
                            {state.at && ` · ${new Date(state.at).toLocaleDateString()}`}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --- The two contractual moments ------------------------------------ */}
      <section className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck size={15} className="text-sky-300" />
          What the contract asks us to record
        </h2>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-sm font-semibold text-white/85">Ready for Launch</p>
            <p className="mt-1 text-xs leading-relaxed text-white/45">
              Section 1 defines the phrase as the state where the work is complete on the preview
              environment and the Agency &ldquo;has confirmed in writing through the dashboard that
              it is ready to go live&rdquo;. This is that confirmation, and it is what makes Payment
              3 due under Section 7. The client sees it on their timeline.
            </p>
            {project.readyForLaunchAt ? (
              <p className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 size={13} />
                Confirmed {new Date(project.readyForLaunchAt).toLocaleDateString()}
                <button
                  type="button"
                  onClick={() => patch({ readyForLaunch: false }, 'ready')}
                  disabled={saving === 'ready'}
                  className="text-white/30 underline transition-colors hover:text-white/60"
                >
                  undo
                </button>
              </p>
            ) : (
              <div className="mt-2.5">
                <BrandButton onClick={() => patch({ readyForLaunch: true }, 'ready')} disabled={saving === 'ready'}>
                  {saving === 'ready' ? 'Recording…' : 'Confirm ready for launch'}
                </BrandButton>
                {!readiness.ready && (
                  <p className="mt-2 text-[11px] text-amber-200/70">
                    {readiness.blockers.length} thing
                    {readiness.blockers.length === 1 ? '' : 's'} above{' '}
                    {readiness.blockers.length === 1 ? 'is' : 'are'} still open. You can confirm
                    anyway — this records a date, it does not check your work.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-sm font-semibold text-white/85">Handover</p>
            <p className="mt-1 text-xs leading-relaxed text-white/45">
              Exhibit A puts credentials, source and documentation in the Launch phase; Section 7
              holds the transfer itself until the final instalment clears, and Section 13 assigns
              the intellectual property at the same moment. This records the day it happened.
            </p>
            {project.handoverAt ? (
              <p className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 size={13} />
                Handed over {new Date(project.handoverAt).toLocaleDateString()}
                <button
                  type="button"
                  onClick={() => patch({ handedOver: false }, 'handover')}
                  disabled={saving === 'handover'}
                  className="text-white/30 underline transition-colors hover:text-white/60"
                >
                  undo
                </button>
              </p>
            ) : (
              <div className="mt-2.5">
                <BrandButton
                  variant="quiet"
                  onClick={() => patch({ handedOver: true }, 'handover')}
                  disabled={saving === 'handover'}
                >
                  {saving === 'handover' ? 'Recording…' : 'Mark it handed over'}
                </BrandButton>
                {finalRow && finalRow.status !== 'paid' && (
                  <p className="mt-2 text-[11px] text-amber-200/70">
                    {finalRow.label} has not cleared. Section 7 holds the transfer until it
                    does — the finished site stays visible on the preview environment meanwhile.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </PageIn>
  );
}
