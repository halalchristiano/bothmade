'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * The page every password-reset email has been pointing at since the flow
 * was written. It did not exist — the link 404'd, so nobody could ever
 * complete a reset even when the token happened to still be in memory.
 *
 * Reads the token from location rather than useSearchParams so the route
 * keeps its static prerender.
 */
export default function ResetPasswordPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [userType, setUserType] = useState<'client' | 'user'>('client');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token'));
    setUserType(params.get('type') === 'user' ? 'user' : 'client');
  }, []);

  const loginHref = userType === 'user' ? '/admin/login' : '/client/login';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Please choose a password of at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setDone(true);
        const target = data.userType === 'user' ? '/admin/login' : '/client/login';
        setTimeout(() => router.push(target), 2200);
      } else {
        setError(data?.error ?? 'We could not reset your password. Request a new link.');
      }
    } catch {
      setError('Could not reach the server — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

  return (
    <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-10 inline-block text-2xl font-bold tracking-tight">
          <span aria-hidden="true" className="text-transparent" style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}>
            both
          </span>
          <span aria-hidden="true">made</span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
          {done ? (
            <div role="status" aria-live="polite">
              <h1 className="text-2xl font-bold mb-3">Password updated</h1>
              <p className="text-white/55 leading-relaxed mb-6">
                You can sign in with your new password now. Taking you to the sign-in page…
              </p>
              <Link href={loginHref} className="text-sky-300 font-semibold hover:underline">
                Go to sign in
              </Link>
            </div>
          ) : token === null ? (
            <div>
              <h1 className="text-2xl font-bold mb-3">Choose a new password</h1>
              <p className="text-white/55 leading-relaxed">Checking your link…</p>
            </div>
          ) : token === '' || !token ? (
            <div>
              <h1 className="text-2xl font-bold mb-3">That link is incomplete</h1>
              <p className="text-white/55 leading-relaxed mb-6">
                The reset link is missing its token — email clients sometimes cut long links in
                half. Request a fresh one and open it in a single click.
              </p>
              <Link href={loginHref} className="text-sky-300 font-semibold hover:underline">
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h1 className="text-2xl font-bold mb-2">Choose a new password</h1>
              <p className="text-white/50 text-sm mb-8">
                At least 8 characters. This link works once, and expires an hour after it was sent.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-2 text-white/70">
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium mb-2 text-white/70">
                    Confirm new password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputClass}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div role="alert" aria-live="polite">
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={saving}
                aria-busy={saving}
                className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-3.5 font-semibold text-black disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {saving ? 'Saving…' : 'Set new password'}
              </button>

              <p className="mt-6 text-center text-sm text-white/40">
                <Link href={loginHref} className="hover:text-white transition-colors">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
