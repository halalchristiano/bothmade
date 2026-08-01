'use client';

import { useEffect, useState } from 'react';
import { Mail, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardHeader, PageIn, PageTitle } from '@/components/admin/ui';

interface GmailStatus {
  connected: boolean;
  gmailAddress: string | null;
  connectedAt: string | null;
}

export default function AdminSettingsPage() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [gmailAddress, setGmailAddress] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch('/api/admin/settings/gmail')
      .then((r) => r.json())
      .then(setStatus);
  };

  useEffect(load, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gmailAddress, appPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to connect');
        return;
      }
      setGmailAddress('');
      setAppPassword('');
      load();
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch('/api/admin/settings/gmail', { method: 'DELETE' });
      load();
    } finally {
      setDisconnecting(false);
    }
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400"></div>
      </div>
    );
  }

  return (
    <PageIn className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-6">
      <PageTitle icon={Mail} title="Settings" />

      <Card className="p-6">
        <CardHeader
          title="Email sending"
          subtitle="Connect your Gmail so client emails go out as you, and land in your own Sent folder."
        />

        {status.connected ? (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-emerald-200">
              <CheckCircle2 size={16} />
              Connected as {status.gmailAddress}
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-xs text-white/40 hover:text-red-300 transition-colors"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Your Gmail address</label>
              <input
                value={gmailAddress}
                onChange={(e) => setGmailAddress(e.target.value)}
                placeholder="evan@bothmade.studio"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Gmail App Password</label>
              <input
                type="password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder="16-character app password"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
              />
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-sky-300 hover:underline"
              >
                Generate one at myaccount.google.com/apppasswords <ExternalLink size={11} />
              </a>
              <p className="text-xs text-white/30 mt-1">
                Requires 2-Step Verification to be turned on for your Google account. This isn't your regular Gmail password.
              </p>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              onClick={handleConnect}
              disabled={connecting || !gmailAddress || !appPassword}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {connecting ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              {connecting ? 'Connecting...' : 'Connect Gmail'}
            </button>
          </div>
        )}
      </Card>
    </PageIn>
  );
}
