'use client';

import { useEffect, useState } from 'react';
import { Users, Loader2, KeyRound, Trash2, UserPlus } from 'lucide-react';
import { Card, CardHeader, Badge } from '@/components/admin/ui';
import { ConfirmDialog, Modal } from '@/components/admin/Modal';

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role?: string;
  title?: string | null;
  gmailAddress?: string | null;
  gmailNeedsReconnect?: boolean;
}

const ROLES = [
  { value: 'owner', label: 'Owner', hint: 'Full access, including team and pricing' },
  { value: 'sales', label: 'Sales', hint: 'Own leads and pipeline; bounded discounting' },
  { value: 'admin', label: 'Admin', hint: 'Full access, same as owner' },
] as const;

/**
 * Team management.
 *
 * Adding a rep, changing a role, or resetting a password all previously
 * required a database console — which in practice meant nobody did it.
 * Roles stayed as they were set on day one, and a contractor who left kept
 * working credentials until someone remembered to go and delete the row.
 */
export function TeamSettings({ currentUserId }: { currentUserId?: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('sales');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const [pendingRemove, setPendingRemove] = useState<TeamMember | null>(null);
  const [pendingReset, setPendingReset] = useState<TeamMember | null>(null);

  const load = async () => {
    setError('');
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401) return;
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error ?? "Couldn't load the team.");
        return;
      }
      setMembers(data.users);
      setCanManage(Boolean(data.canManage));
    } catch {
      setError('Could not reach the server — check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleInvite = async () => {
    setInviteBusy(true);
    setInviteError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setInviteError(data?.error ?? "Couldn't add them.");
        return;
      }
      setInviting(false);
      setInviteEmail('');
      setInviteName('');
      setNotice(
        data.temporaryPassword
          ? `Added, but the invite email didn't send. Give them this password by hand: ${data.temporaryPassword}`
          : `Added — ${inviteEmail} has been emailed a temporary password.`
      );
      await load();
    } catch {
      setInviteError('Could not reach the server.');
    } finally {
      setInviteBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error ?? "That didn't save.");
        return null;
      }
      await load();
      return data;
    } catch {
      setError('Could not reach the server.');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async () => {
    if (!pendingReset) return;
    const data = await patch(pendingReset.id, { resetPassword: true });
    if (data) {
      setNotice(
        data.temporaryPassword
          ? `Reset, but the email didn't send. Give them this by hand: ${data.temporaryPassword}`
          : `${pendingReset.email} has been emailed a new temporary password.`
      );
    }
    setPendingReset(null);
  };

  const handleRemove = async () => {
    if (!pendingRemove) return;
    setBusyId(pendingRemove.id);
    try {
      const res = await fetch(`/api/admin/users/${pendingRemove.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error ?? "Couldn't remove them.");
        return;
      }
      setNotice(
        data.leadsReassigned > 0
          ? `Removed. Their ${data.leadsReassigned} lead${data.leadsReassigned === 1 ? '' : 's'} moved to you.`
          : 'Removed.'
      );
      setPendingRemove(null);
      await load();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusyId(null);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60 transition-colors';

  return (
    <Card className="p-6">
      <CardHeader
        icon={Users}
        tone="purple"
        title="Team"
        subtitle={canManage ? 'Who has access, and what they can do' : 'Who has access'}
      />

      <div role="status" aria-live="polite">
        {notice && (
          <p className="mb-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </p>
        )}
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-white/30">Loading…</p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => {
            const isSelf = m.id === currentUserId;
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {m.name || m.email}
                    {isSelf && <span className="ml-2 text-xs text-white/35">(you)</span>}
                  </p>
                  <p className="text-xs text-white/40 truncate">{m.email}</p>
                  {m.gmailNeedsReconnect && (
                    <p className="text-xs text-amber-300 mt-0.5">Gmail needs reconnecting</p>
                  )}
                </div>

                {canManage ? (
                  <label className="shrink-0">
                    <span className="sr-only">Role for {m.name || m.email}</span>
                    <select
                      value={m.role ?? 'sales'}
                      disabled={busyId === m.id}
                      onChange={(e) => patch(m.id, { role: e.target.value })}
                      className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/15 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  m.role && <Badge tone="neutral">{m.role}</Badge>
                )}

                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setPendingReset(m)}
                      disabled={busyId === m.id}
                      aria-label={`Reset password for ${m.name || m.email}`}
                      title="Reset password"
                      className="p-1.5 rounded-lg text-white/35 hover:text-amber-300 hover:bg-white/5 transition-colors disabled:opacity-40"
                    >
                      {busyId === m.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <KeyRound size={14} />
                      )}
                    </button>
                    {!isSelf && (
                      <button
                        onClick={() => setPendingRemove(m)}
                        disabled={busyId === m.id}
                        aria-label={`Remove ${m.name || m.email} from the team`}
                        title="Remove from team"
                        className="p-1.5 rounded-lg text-white/35 hover:text-red-300 hover:bg-white/5 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {canManage && (
            <button
              onClick={() => setInviting(true)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-2.5 text-sm font-semibold text-white/60 hover:text-white hover:border-white/30 transition-colors"
            >
              <UserPlus size={15} /> Add someone
            </button>
          )}
        </div>
      )}

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Add a team member"
        description="They'll get an email with a temporary password to change on first sign-in."
        labelledById="invite-title"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/60">Email</span>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@bothmade.studio"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-white/60">Name</span>
            <input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Their name"
              className={inputClass}
            />
          </label>
          <fieldset>
            <legend className="mb-1 block text-xs font-medium text-white/60">Role</legend>
            <div className="space-y-1.5">
              {ROLES.map((r) => (
                <label key={r.value} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="invite-role"
                    value={r.value}
                    checked={inviteRole === r.value}
                    onChange={() => setInviteRole(r.value)}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    {r.label}
                    <span className="block text-xs text-white/40">{r.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div role="alert" aria-live="polite">
            {inviteError && <p className="text-sm text-red-400">{inviteError}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={() => setInviting(false)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={inviteBusy || !inviteEmail.trim()}
              aria-busy={inviteBusy}
              className="rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {inviteBusy ? 'Adding…' : 'Add to team'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingReset !== null}
        onCancel={() => setPendingReset(null)}
        onConfirm={handleReset}
        title="Reset their password?"
        description={`${pendingReset?.name || pendingReset?.email} will be signed out everywhere and emailed a new temporary password. Their current one stops working immediately.`}
        confirmLabel="Reset password"
        tone="normal"
        busy={busyId === pendingReset?.id}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        onCancel={() => setPendingRemove(null)}
        onConfirm={handleRemove}
        title="Remove from the team?"
        description={`${pendingRemove?.name || pendingRemove?.email} loses access immediately. Any leads assigned to them move to you, so nothing is left unowned.`}
        confirmLabel="Remove"
        busy={busyId === pendingRemove?.id}
      />
    </Card>
  );
}
