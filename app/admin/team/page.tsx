'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Copy, KeyRound, Trash2, UserCog, UserPlus, X } from 'lucide-react';
import { Badge, BrandButton, Card, CardHeader, Kicker, PageIn, PageTitle, inputClass } from '@/components/admin/ui';
import {
  USER_ROLES,
  USER_ROLE_DESCRIPTIONS,
  USER_ROLE_LABELS,
  canManageTeam,
  type UserRole,
} from '@/lib/roles';
import { redirectIfSessionExpired } from '@/lib/admin-session-expiry';

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
  title: string | null;
  createdAt: string;
  /**
   * The mailbox this account sends from. Shown here because the team list is
   * where somebody asks "why aren't the automated follow-ups going out" — and
   * the answer used to live on a page that only ever showed your own.
   */
  mailbox?: {
    address: string | null;
    connectedAt: string | null;
    needsReconnect: boolean;
    canSend: boolean;
  };
}

function roleTone(role: string): 'purple' | 'sky' | 'neutral' {
  if (role === 'owner') return 'purple';
  if (role === 'sales') return 'sky';
  return 'neutral';
}

/**
 * The one-time password shown after adding someone, or after resetting a
 * teammate who is locked out. Only a hash is stored, so this is genuinely the
 * last chance to read it — hence a copy button rather than a line of text
 * people squint at and mistype.
 *
 * Dismissable, which it did not need to be while adding was the only thing
 * that produced one: a reset happens to an account that already exists and
 * will happen more often, and a live credential sitting on a studio screen
 * until the next navigation is not something to leave to chance.
 */
function InitialPassword({
  email,
  password,
  reason,
  onDismiss,
}: {
  email: string;
  password: string;
  reason: 'added' | 'reset';
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-4 mb-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-sm text-emerald-300 font-medium">
          {reason === 'added' ? `${email} can now sign in.` : `${email} can sign in again.`}
        </p>
        <button
          onClick={onDismiss}
          aria-label="Hide this password"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      <p className="text-[13px] text-white/50 mb-3">
        {reason === 'reset'
          ? 'Their old password no longer works and they have been signed out everywhere. This one is shown once and is not recoverable — send it to them now.'
          : 'This password is shown once and is not recoverable — send it to them now.'}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md bg-black/40 px-3 py-2 font-mono text-sm text-white break-all">
          {password}
        </code>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(password);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="shrink-0 rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:text-white hover:border-white/30 transition-colors"
          aria-label="Copy password"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const router = useRouter();
  // Same reason as the billing ledger: `load` is a useCallback that drives an
  // effect, so anything in its dependency list that changes identity per
  // render re-runs the load — and `load` opens by clearing the error banner.
  const pushRef = useRef(router.push);
  pushRef.current = router.push;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', role: 'sales' as UserRole });
  const [issued, setIssued] = useState<
    { email: string; password: string; reason: 'added' | 'reset' } | null
  >(null);
  /**
   * A role change waiting to be confirmed.
   *
   * It used to apply the moment the dropdown changed. That put the two most
   * consequential grants in the studio — Owner, which is team management and
   * bulk deletion, and the below-the-floor pricing authority — one mis-click
   * away, with no statement of what was being handed over and nothing to
   * press to undo it. The Remove button beside it has always confirmed; this
   * is the same courtesy for the control that is easier to hit by accident.
   */
  const [pendingRole, setPendingRole] = useState<{ id: string; role: UserRole } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [teamRes, meRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/auth/me'),
      ]);

      // Signed out, not broken. This said "Could not load the team." on the
      // one screen that can put an account back, with no hint that the fix
      // was to log in again.
      if (redirectIfSessionExpired(teamRes, pushRef.current)) return;

      if (!teamRes.ok) {
        setError('Could not load the team.');
        return;
      }

      const teamData = await teamRes.json();
      setMembers(teamData.users ?? []);

      if (meRes.ok) {
        const me = await meRes.json();
        setMyRole(me?.user?.role ?? null);
        setMyId(me?.user?.id ?? null);
      }
    } catch {
      setError('Could not load the team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = canManageTeam(myRole);
  const hasSalesRep = members.some((m) => m.role === 'sales');

  const changeRole = async (id: string, role: string) => {
    setBusyId(id);
    setError('');
    setPendingRole(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not change that role.');
        return;
      }
      await load();
    } catch {
      setError('Could not change that role.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (member: TeamMember) => {
    const label = member.name || member.email;
    if (!confirm(`Remove ${label}? Any leads they own become unassigned.`)) return;

    setBusyId(member.id);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${member.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not remove that account.');
        return;
      }
      if (data.orphanedLeads > 0) {
        setError(
          `${label} is gone. ${data.orphanedLeads} lead${
            data.orphanedLeads === 1 ? '' : 's'
          } are now unassigned — reassign them on the Leads page.`
        );
      }
      await load();
    } catch {
      setError('Could not remove that account.');
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (member: TeamMember) => {
    const label = member.name || member.email;
    if (
      !confirm(
        `Reset ${label}'s password? Their current one stops working and they are signed out everywhere. You will get a new one to send them.`
      )
    )
      return;

    setBusyId(member.id);
    setError('');
    setIssued(null);
    try {
      const res = await fetch(`/api/admin/users/${member.id}/reset-password`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not reset that password.');
        return;
      }
      setIssued({ email: data.email, password: data.initialPassword, reason: 'reset' });
    } catch {
      setError('Could not reset that password.');
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    setBusyId('new');
    setError('');
    setIssued(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not add that person.');
        return;
      }
      setIssued({ email: data.user.email, password: data.initialPassword, reason: 'added' });
      setDraft({ name: '', email: '', role: 'sales' });
      setAdding(false);
      await load();
    } catch {
      setError('Could not add that person.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageIn className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-6">
        <Kicker className="mb-2">Studio</Kicker>
        <PageTitle icon={UserCog} title="Team" tone="purple" />
        <p className="text-[13px] text-white/40 mt-2">
          Who can sign in, and what each of them can reach.
        </p>
      </div>

      {/* The exact failure that made this page necessary: inbound is assigned
          to whoever holds `sales`, and with nobody holding it the leads arrive
          unassigned and never reach a call list. Say so where it's fixable. */}
      {!loading && !hasSalesRep && (
        <Card className="p-4 mb-5" glow="amber">
          <div className="flex gap-3">
            <AlertTriangle size={16} className="text-amber-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-white font-medium">Nobody has the Sales role.</p>
              <p className="text-[13px] text-white/50 mt-1">
                Inbound enquiries are assigned to whoever holds it, and the alert about a new
                one is sent to them. Until someone does, leads still arrive on the Leads page
                but stay unassigned — which keeps them out of the call list and the daily
                follow-up digest.
              </p>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <div
          role="status"
          className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 mb-5 text-sm text-amber-200"
        >
          {error}
        </div>
      )}

      {issued && (
        <InitialPassword
          email={issued.email}
          password={issued.password}
          reason={issued.reason}
          onDismiss={() => setIssued(null)}
        />
      )}

      <Card className="p-6">
        <CardHeader
          icon={UserCog}
          tone="purple"
          title="Members"
          subtitle={loading ? 'Loading…' : `${members.length} account${members.length === 1 ? '' : 's'}`}
          action={
            canManage && !adding ? (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 text-xs text-sky-300/70 hover:text-sky-300 transition-colors"
              >
                <UserPlus size={13} /> Add someone
              </button>
            ) : undefined
          }
        />

        {adding && (
          <div className="rounded-lg border border-white/10 p-4 mb-5 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                className={inputClass}
                placeholder="Name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <input
                className={inputClass}
                type="email"
                placeholder="name@bothmade.studio"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <div>
              <select
                className={`${inputClass} cursor-pointer`}
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })}
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role} className="bg-raised">
                    {USER_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <p className="text-[12px] text-white/35 mt-1.5">
                {USER_ROLE_DESCRIPTIONS[draft.role]}
              </p>
            </div>
            <div className="flex gap-2">
              <BrandButton variant="primary" onClick={add} disabled={!draft.email.trim() || busyId === 'new'}>
                {busyId === 'new' ? 'Adding…' : 'Add'}
              </BrandButton>
              <BrandButton
                variant="quiet"
                onClick={() => {
                  setAdding(false);
                  setError('');
                }}
              >
                Cancel
              </BrandButton>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-white/40">No accounts yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {members.map((member) => {
              const pending = pendingRole?.id === member.id ? pendingRole : null;
              return (
              /* Wraps rather than competing for one line. Name, role and remove
                 were three items in a nowrap row, so on a phone the name — the
                 only thing that identifies the row — truncated first to keep a
                 dropdown and an icon on screen. */
              <li key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <p className="truncate text-sm text-white">
                    {member.name || member.email}
                    {member.id === myId && <span className="text-white/30"> — you</span>}
                  </p>
                  <p className="truncate text-[13px] text-white/40">{member.email}</p>

                  {/*
                    Whether this account can actually send, and a way to fix it
                    without signing out.

                    Connecting Google used to be reachable only from Settings,
                    which mints the consent for whoever is signed in — so
                    attaching a mailbox to a *different* account meant creating
                    the teammate, noting the one-time password, signing out,
                    signing in as them, connecting, and signing back in.
                    Nothing said so. That is why the outreach mailbox the
                    follow-up cron sends from sat unconnected for weeks while
                    the cron declined every weekday into a log nobody opens.
                  */}
                  {member.mailbox && (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                      {member.mailbox.canSend && !member.mailbox.needsReconnect ? (
                        <span className="text-emerald-300/80">
                          Sends from {member.mailbox.address || member.email}
                        </span>
                      ) : member.mailbox.needsReconnect ? (
                        <span className="text-amber-300/90">Email disconnected — needs reconnecting</span>
                      ) : (
                        <span className="text-white/35">No mailbox connected</span>
                      )}

                      {canManage && (
                        <a
                          href={`/api/admin/settings/gmail-oauth/start?userId=${encodeURIComponent(member.id)}`}
                          className="rounded py-1 text-sky-300/90 underline-offset-2 hover:underline"
                        >
                          {member.mailbox.canSend ? 'Reconnect' : 'Connect Gmail'}
                        </a>
                      )}
                    </p>
                  )}
                  {/* Said on the page, not in a tooltip.
                      This was a `title` on the disabled dropdown, which needs a
                      mouse pointer to hover — so on a phone the control was
                      simply greyed out with nothing anywhere explaining why,
                      and the rule ("another owner has to do it") is not one you
                      can guess. */}
                  {canManage && member.id === myId && (
                    <p className="mt-0.5 text-[12px] text-white/30">
                      Another owner has to change your role.
                    </p>
                  )}
                </div>

                {canManage ? (
                  <select
                    value={pending ? pending.role : member.role}
                    disabled={busyId === member.id || member.id === myId}
                    onChange={(e) =>
                      setPendingRole(
                        e.target.value === member.role
                          ? null
                          : { id: member.id, role: e.target.value as UserRole }
                      )
                    }
                    aria-label={`Role for ${member.name || member.email}`}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[13px] text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-white/30"
                  >
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role} className="bg-raised">
                        {USER_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="shrink-0">
                    <Badge solid tone={roleTone(member.role)}>
                      {USER_ROLE_LABELS[member.role as UserRole] ?? member.role}
                    </Badge>
                  </span>
                )}

                {canManage && member.id !== myId && (
                  <>
                    {/* The way back in for somebody locked out. Without it the
                        only route was delete-and-re-add, which unassigns every
                        lead they own and takes their side of the team chat. */}
                    <button
                      onClick={() => resetPassword(member)}
                      disabled={busyId === member.id}
                      aria-label={`Reset password for ${member.name || member.email}`}
                      title="Reset password"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-sky-300 disabled:opacity-30"
                    >
                      <KeyRound size={15} />
                    </button>

                    {/* A real target around the icon. A 15px glyph is about a
                        third of the width a finger needs, and it sits
                        immediately beside the role dropdown — so the smallest
                        control in the row was the destructive one, next to the
                        one people actually came to use. The icon is unchanged;
                        the padding is what you press. */}
                    <button
                      onClick={() => remove(member)}
                      disabled={busyId === member.id}
                      aria-label={`Remove ${member.name || member.email}`}
                      className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-red-300 disabled:opacity-30"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}

                {/* What the dropdown is about to hand over, said before it
                    happens rather than discovered afterwards. The role's own
                    description is the sentence — the same one shown when
                    adding somebody, which is the only other place this
                    decision gets made. */}
                {pending && (
                  <div className="basis-full rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3">
                    <p className="text-[13px] text-white">
                      Make {member.name || member.email}{' '}
                      <strong className="font-semibold">{USER_ROLE_LABELS[pending.role]}</strong>?
                    </p>
                    <p className="text-[12px] text-white/50 mt-1">
                      {USER_ROLE_DESCRIPTIONS[pending.role]}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <BrandButton
                        variant="primary"
                        onClick={() => changeRole(member.id, pending.role)}
                        disabled={busyId === member.id}
                      >
                        {busyId === member.id ? 'Changing…' : 'Change role'}
                      </BrandButton>
                      <BrandButton variant="quiet" onClick={() => setPendingRole(null)}>
                        Cancel
                      </BrandButton>
                    </div>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}

        {!loading && !canManage && (
          <p className="text-[13px] text-white/35 mt-5 pt-4 border-t border-white/[0.06]">
            Only an owner can add, remove or re-role a teammate. Everything else in the
            admin is open to every staff account.
          </p>
        )}
      </Card>
    </PageIn>
  );
}
