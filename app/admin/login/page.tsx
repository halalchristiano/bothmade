'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GridBackdrop } from '@/components/ui';

function Logo() {
  return (
    <span className="text-2xl font-bold tracking-tight">
      <span
        aria-hidden="true"
        className="text-transparent"
        style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}
      >
        both
      </span>
      <span aria-hidden="true">made</span>
    </span>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Staff had no way back in from a forgotten password: the reset endpoint
  // has always supported team accounts, but only the client login page ever
  // called it. That was survivable while /api/auth/signup would mint a new
  // admin for anyone — now that it won't, a locked-out owner would have
  // needed a database edit to recover.
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/admin/dashboard');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, userType: 'user' }),
      });

      // The endpoint answers the same way whether or not the address has an
      // account, so there is nothing here worth branching on beyond "the
      // request went through".
      if (response.ok) {
        setResetSent(true);
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Failed to send reset email');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-400/60 focus:border-transparent transition-colors';

  return (
    <main className="relative min-h-screen bg-[#05030a] text-white flex items-center justify-center px-4 overflow-hidden">
      <GridBackdrop rgb="147,51,234" className="opacity-60" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full blur-[120px] opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(147,51,234,0.5), transparent 70%)' }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl">
          {showForgotPassword ? (
            <>
              <h1 className="text-2xl font-bold mb-2">Reset password</h1>
              <p className="text-white/50 mb-6 text-sm">
                Enter your team email and we&apos;ll send you a reset link.
              </p>

              {resetSent ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-300 text-sm">
                    If an account exists for that email, a reset link is on its way — check your
                    inbox (and spam folder). The link expires in an hour.
                  </div>
                  <button
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetSent(false);
                      setResetEmail('');
                    }}
                    className="w-full rounded-lg border border-white/15 py-3 font-semibold hover:bg-white/5 transition-colors"
                  >
                    Back to login
                  </button>
                </div>
              ) : (
                <>
                  <form onSubmit={handlePasswordReset} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-white/70">Email</label>
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="you@bothmade.studio"
                        className={inputClass}
                        required
                      />
                    </div>

                    {error && <div className="text-red-400 text-sm">{error}</div>}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-lg bg-gradient-to-r from-purple-500 to-sky-400 py-3 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
                    >
                      {loading ? 'Sending…' : 'Send reset link'}
                    </button>
                  </form>

                  <button
                    onClick={() => {
                      setShowForgotPassword(false);
                      setError('');
                      setResetEmail('');
                    }}
                    className="w-full text-center text-white/50 hover:text-white mt-4 text-sm transition-colors"
                  >
                    Back to login
                  </button>
                </>
              )}
            </>
          ) : (
            <>
          <h1 className="text-2xl font-bold mb-2">Admin</h1>
          <p className="text-white/50 mb-6 text-sm">Internal team access only</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            {error && <div className="text-red-400 text-sm">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-purple-500 to-sky-400 py-3 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <button
            onClick={() => {
              setShowForgotPassword(true);
              setError('');
            }}
            className="w-full text-center text-white/50 hover:text-white mt-4 text-sm transition-colors"
          >
            Forgot password?
          </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
