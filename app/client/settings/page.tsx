'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ClientHeader } from '@/components/portal/ClientHeader';
import { checkPasswordStrength, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';

interface Preferences {
  notificationsEnabled: boolean;
  digestFrequency: string;
  statusUpdates: boolean;
  messages: boolean;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-6 rounded-full transition-colors ${
        on ? 'bg-gradient-to-r from-sky-400 to-purple-500' : 'bg-white/10'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function ClientSettingsPage() {
  return (
    <Suspense fallback={null}>
      <ClientSettingsInner />
    </Suspense>
  );
}

function ClientSettingsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forced = searchParams.get('force') === '1';
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preferences, setPreferences] = useState<Preferences>({
    notificationsEnabled: true,
    digestFrequency: 'daily',
    statusUpdates: true,
    messages: true,
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/client/settings');
        if (response.status === 401) {
          router.push('/client/login');
          return;
        }
        const data = await response.json();
        if (data.success && data.preferences) {
          setPreferences(data.preferences);
        }
        if (data.success && data.client?.mustChangePassword) {
          setMustChangePassword(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const handleSavePreferences = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/client/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      const data = await response.json();
      if (data.success) {
        setMessage('Preferences updated successfully');
      } else {
        setError(data.error || 'Failed to update preferences');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    // Mirrors the server check so the client sees the rule before sending.
    const strength = checkPasswordStrength(newPassword);
    if (!strength.ok) {
      setPasswordError(strength.error || 'Choose a stronger password');
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch('/api/client/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (data.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        if (mustChangePassword || forced) {
          setMustChangePassword(false);
          router.push('/client/projects');
          return;
        }
        setMessage('Password updated successfully');
      } else {
        setPasswordError(data.error || 'Failed to update password');
      }
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  if (loading) {
    return (
      <main className="min-h-screen bg-[#05030a] flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05030a] text-white">
      <ClientHeader />

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>

        {(forced || mustChangePassword) && (
          <div className="rounded-2xl border border-sky-400/30 bg-gradient-to-r from-sky-400/10 to-purple-500/10 p-5">
            <p className="font-semibold mb-1">Set your own password to continue</p>
            <p className="text-sm text-white/60">
              You're logged in with a temporary password from your welcome email. Choose a new one below before accessing your dashboard.
            </p>
          </div>
        )}

        {message && (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-300 text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div
          className={`rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 ${
            forced || mustChangePassword ? 'opacity-40 pointer-events-none' : ''
          }`}
        >
          <h2 className="text-xl font-bold mb-6">Email Preferences</h2>

          <div className="space-y-6">
            <div className="flex items-center justify-between pb-6 border-b border-white/10">
              <div>
                <h3 className="font-semibold">Notify me of project updates</h3>
                <p className="text-sm text-white/40">Master toggle for all email notifications</p>
              </div>
              <Toggle
                on={preferences.notificationsEnabled}
                onClick={() =>
                  setPreferences({
                    ...preferences,
                    notificationsEnabled: !preferences.notificationsEnabled,
                  })
                }
              />
            </div>

            <div className="pb-6 border-b border-white/10">
              <h3 className="font-semibold mb-3">Notification frequency</h3>
              <select
                value={preferences.digestFrequency}
                onChange={(e) =>
                  setPreferences({ ...preferences, digestFrequency: e.target.value })
                }
                className={inputClass}
              >
                <option className="bg-[#05030a]" value="immediate">Immediate</option>
                <option className="bg-[#05030a]" value="daily">Daily</option>
                <option className="bg-[#05030a]" value="weekly">Weekly</option>
              </select>
            </div>

            <div className="flex items-center justify-between pb-6 border-b border-white/10">
              <h3 className="font-semibold">Email me about status changes</h3>
              <Toggle
                on={preferences.statusUpdates}
                onClick={() =>
                  setPreferences({ ...preferences, statusUpdates: !preferences.statusUpdates })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Email me about new messages</h3>
              <Toggle
                on={preferences.messages}
                onClick={() => setPreferences({ ...preferences, messages: !preferences.messages })}
              />
            </div>

            <button
              onClick={handleSavePreferences}
              disabled={saving}
              className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-3 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
          <h2 className="text-xl font-bold mb-6">Update Password</h2>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70" htmlFor="current-password">Current Password</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70" htmlFor="new-password">New Password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70" htmlFor="confirm-password">Confirm New Password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
            </div>

            {passwordError && <div className="text-red-400 text-sm">{passwordError}</div>}

            <button
              type="submit"
              disabled={passwordSaving}
              className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-3 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {passwordSaving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
