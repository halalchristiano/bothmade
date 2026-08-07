'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GridBackdrop } from '@/components/ui';
import { checkPasswordStrength, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';

/**
 * Where a password-reset email actually lands.
 *
 * The reset endpoint has always emailed a link to `/auth/reset-password`,
 * and this page never existed — every reset link 404'd, which is why the
 * in-memory token store's other problems never surfaced. Now that tokens
 * are real rows with a real expiry, the link has somewhere to go.
 *
 * The token is read from `window.location.search` rather than
 * `useSearchParams()` so this page prerenders without a Suspense boundary.
 */
function Logo() {
  return (
    <span className="text-2xl font-extrabold tracking-tight">
      <span className="text-sky-300">both</span>
      <span className="text-white">made</span>
    </span>
  );
}

const inputClass =
  'w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Those two passwords do not match.');
      return;
    }

    // Mirrors the server's policy so the rule shows up before the round trip.
    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      setError(strength.error || 'Choose a stronger password.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDone(true);
      } else {
        setError(data.error || 'That link is no longer valid. Request a new one.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#05030a] text-white flex items-center justify-center px-4 overflow-hidden">
      <GridBackdrop className="opacity-60" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full blur-[120px] opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.5), transparent 70%)' }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl">
          {done ? (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Password updated</h1>
              <p className="text-white/50 text-sm">
                You can sign in with your new password now. This link won&apos;t work again.
              </p>
              <div className="flex gap-3">
                <Link
                  href="/client/login"
                  className="flex-1 text-center rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-3 font-semibold text-black hover:opacity-90 transition-opacity"
                >
                  Client login
                </Link>
                <Link
                  href="/admin/login"
                  className="flex-1 text-center rounded-lg border border-white/15 py-3 font-semibold hover:bg-white/5 transition-colors"
                >
                  Team login
                </Link>
              </div>
            </div>
          ) : token === '' ? (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">Link incomplete</h1>
              <p className="text-white/50 text-sm">
                This page needs the reset link from your email. Open the link directly, or request a
                new one from the login page.
              </p>
              <Link
                href="/client/login"
                className="block text-center rounded-lg border border-white/15 py-3 font-semibold hover:bg-white/5 transition-colors"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2">Choose a new password</h1>
              <p className="text-white/50 mb-6 text-sm">
                At least {MIN_PASSWORD_LENGTH} characters, mixing letters, numbers, and symbols.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white/70" htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={MIN_PASSWORD_LENGTH}
                    className={inputClass}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white/70" htmlFor="confirm-password">
                    Confirm new password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={MIN_PASSWORD_LENGTH}
                    className={inputClass}
                    autoComplete="new-password"
                    required
                  />
                </div>

                {error && (
                  <div className="text-red-400 text-sm" role="alert">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || token === null}
                  className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-3 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {saving ? 'Saving…' : 'Set new password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
