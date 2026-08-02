'use client';

import { useEffect, useState } from 'react';
import { Mail, CheckCircle2, ExternalLink, Loader2, Eye } from 'lucide-react';
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

  const [previewBeforeBulkSend, setPreviewBeforeBulkSend] = useState<boolean | null>(null);
  const [savingPreview, setSavingPreview] = useState(false);

  const load = () => {
    fetch('/api/admin/settings/gmail')
      .then((r) => r.json())
      .then(setStatus);
    fetch('/api/admin/settings/preferences')
      .then((r) => r.json())
      .then((data) => setPreviewBeforeBulkSend(data.previewBeforeBulkSend));
  };

  useEffect(load, []);

  const handleTogglePreview = async () => {
    if (previewBeforeBulkSend === null) return;
    const next = !previewBeforeBulkSend;
    setPreviewBeforeBulkSend(next);
    setSavingPreview(true);
    try {
      await fetch('/api/admin/settings/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewBeforeBulkSend: next }),
      });
    } finally {
      setSavingPreview(false);
    }
  };

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

            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2.5">
                <p className="text-xs text-red-300">{error}</p>
                <p className="text-xs text-white/40 mt-2">
                  On a bothmade.studio Google Workspace account? An admin has to turn on app passwords for the
                  organization first —{' '}
                  <a
                    href="https://admin.google.com/ac/security/lsa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-300 hover:underline inline-flex items-center gap-1"
                  >
                    open that setting in the Admin Console <ExternalLink size={10} />
                  </a>
                  , enable "Allow users to manage their access to less secure apps" and app passwords for this user
                  (2-Step Verification must be on first), then try connecting again.
                </p>
              </div>
            )}

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

      <Card className="p-6">
        <CardHeader
          title="Bulk sending"
          subtitle="Controls what happens when you use a 'Send all now' cold-email button."
        />
        <button
          onClick={handleTogglePreview}
          disabled={previewBeforeBulkSend === null || savingPreview}
          className="mt-4 w-full flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left hover:bg-white/[0.05] transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-400/10 flex items-center justify-center shrink-0">
              <Eye size={16} className="text-sky-300" />
            </div>
            <div>
              <p className="text-sm font-medium">Preview before bulk sending</p>
              <p className="text-xs text-white/40 mt-0.5">
                Show every recipient's subject and body before a batch cold-email send actually goes out.
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              previewBeforeBulkSend ? 'bg-gradient-to-r from-sky-400 to-purple-500' : 'bg-white/15'
            }`}
          >
            <span
              className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white transition-transform ${
                previewBeforeBulkSend ? 'translate-x-[22px]' : 'translate-x-1'
              }`}
            />
          </span>
        </button>
      </Card>
    </PageIn>
  );
}
