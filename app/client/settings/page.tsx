'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Preferences {
  notificationsEnabled: boolean;
  digestFrequency: string;
  statusUpdates: boolean;
  messages: boolean;
}

export default function ClientSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
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

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Settings</h1>
          <Link href="/client/projects" className="text-gray-600 hover:text-black transition-colors">
            Back to Projects
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {message && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Email Preferences</h2>

          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div>
                <h3 className="font-semibold">Notify me of project updates</h3>
                <p className="text-sm text-gray-600">Master toggle for all email notifications</p>
              </div>
              <button
                onClick={() =>
                  setPreferences({
                    ...preferences,
                    notificationsEnabled: !preferences.notificationsEnabled,
                  })
                }
                className={`w-12 h-6 rounded-full transition-colors ${
                  preferences.notificationsEnabled ? 'bg-black' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    preferences.notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="pb-4 border-b border-gray-200">
              <h3 className="font-semibold mb-3">Notification frequency</h3>
              <select
                value={preferences.digestFrequency}
                onChange={(e) =>
                  setPreferences({ ...preferences, digestFrequency: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="immediate">Immediate</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div>
                <h3 className="font-semibold">Email me about status changes</h3>
              </div>
              <button
                onClick={() =>
                  setPreferences({ ...preferences, statusUpdates: !preferences.statusUpdates })
                }
                className={`w-12 h-6 rounded-full transition-colors ${
                  preferences.statusUpdates ? 'bg-black' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    preferences.statusUpdates ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Email me about new messages</h3>
              </div>
              <button
                onClick={() =>
                  setPreferences({ ...preferences, messages: !preferences.messages })
                }
                className={`w-12 h-6 rounded-full transition-colors ${
                  preferences.messages ? 'bg-black' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    preferences.messages ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <button
              onClick={handleSavePreferences}
              disabled={saving}
              className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6">Update Password</h2>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                minLength={8}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                minLength={8}
                required
              />
            </div>

            {passwordError && <div className="text-red-600 text-sm">{passwordError}</div>}

            <button
              type="submit"
              disabled={passwordSaving}
              className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              {passwordSaving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
