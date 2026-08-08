'use client';

import { safeReturnTo } from '@/lib/client-return-to';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

export default function ClientLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, userType: 'client' }),
      });

      const data = await response.json();

      if (data.success) {
        /*
         * Back to whatever sent them here, when there was one.
         *
         * A client follows a link from an email to a project, the session has
         * expired, and the portal bounces them here — then landed them on the
         * project list, with no memory of what they clicked. `next` is read
         * through safeReturnTo, which refuses anything that is not a path
         * inside the client portal: a login page that redirects wherever a
         * query string says is an open redirect.
         *
         * A forced password change still wins. Somebody on a generated
         * password has to replace it before the rest of the portal will
         * answer them at all, so sending them anywhere else is a redirect
         * into a wall.
         */
        const next = safeReturnTo(new URLSearchParams(window.location.search).get('next'));
        router.push(data.client?.mustChangePassword ? '/client/settings?force=1' : next);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Login failed');
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
        body: JSON.stringify({ email: resetEmail, userType: 'client' }),
      });

      if (response.ok) {
        setResetSent(true);
      } else {
        setError('Failed to send reset email');
      }
    } catch (err) {
      setError('Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-colors';

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
          {showForgotPassword ? (
            <>
              <h1 className="text-2xl font-bold mb-2">Reset Password</h1>
              <p className="text-white/50 mb-6 text-sm">
                Enter your email and we'll send you a reset link.
              </p>

              {resetSent ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-300 text-sm">
                    If an account exists for that email, a reset link is on its way — check your inbox (and spam folder).
                  </div>
                  <button
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetSent(false);
                      setResetEmail('');
                    }}
                    className="w-full rounded-lg border border-white/15 py-3 font-semibold hover:bg-white/5 transition-colors"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white/70" htmlFor="reset-email">
                      Email Address
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="your@company.com"
                      className={inputClass}
                      required
                    />
                  </div>

                  {error && <div className="text-red-400 text-sm">{error}</div>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-3 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </form>
              )}

              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setError('');
                  setResetEmail('');
                  setResetSent(false);
                }}
                className="w-full text-center text-white/50 hover:text-white mt-4 text-sm transition-colors"
              >
                Back to Login
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2">Client Login</h1>
              <p className="text-white/50 mb-6 text-sm">Access your project dashboard</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white/70" htmlFor="login-email">
                    Email Address
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@company.com"
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-white/70" htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                    required
                  />
                </div>

                {error && <div className="text-red-400 text-sm">{error}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 py-3 font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowForgotPassword(true)}
                  className="text-white/50 hover:text-white text-sm transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10 text-center">
                <p className="text-white/50 text-sm">
                  Looking to start a new project?{' '}
                  <Link href="/start" className="text-sky-300 font-semibold hover:underline">
                    Get Started
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
