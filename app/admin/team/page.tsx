'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Trash2, UserCog, UserPlus } from 'lucide-react';
import { Badge, BrandButton, Card, CardHeader, Kicker, PageIn, PageTitle, inputClass } from '@/components/admin/ui';
import {
  USER_ROLES,
  USER_ROLE_DESCRIPTIONS,
  USER_ROLE_LABELS,
  canManageTeam,
  type UserRole,
} from '@/lib/roles';

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
  title: string | null;
  createdAt: string;
}

function roleTone(role: string): 'purple' | 'sky' | 'neutral' {
  if (role === 'owner') return 'purple';
  if (role === 'sales') return 'sky';
  return 'neutral';
}

/**
 * The one-time password shown after adding someone. Only a hash is stored, so
 * this is genuinely the last chance to read it — hence a copy button rather
 * than a line of text people squint at and mistype.
 */
function InitialPassword({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-4 mb-5">
      <p className="text-sm text-emerald-300 font-medium mb-1">{email} can now sign in.</p>
      <p className="text-[13px] text-white/50 mb-3">
        This password is shown once and is not recoverable — send it to them now.
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
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', role: 'sales' as UserRole });
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [teamRes, meRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/auth/me'),
      ]);

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
      setIssued({ email: data.user.email, password: data.initialPassword });
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

      {issued && <InitialPassword email={issued.email} password={issued.password} />}

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
            {members.map((member) => (
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
                    value={member.role}
                    disabled={busyId === member.id || member.id === myId}
                    onChange={(e) => changeRole(member.id, e.target.value)}
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
                  /* A real target around the icon. A 15px glyph is about a
                     third of the width a finger needs, and it sits immediately
                     beside the role dropdown — so the smallest control in the
                     row was the destructive one, next to the one people
                     actually came to use. The icon is unchanged; the padding
                     is what you press. */
                  <button
                    onClick={() => remove(member)}
                    disabled={busyId === member.id}
                    aria-label={`Remove ${member.name || member.email}`}
                    className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-red-300 disabled:opacity-30"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
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
