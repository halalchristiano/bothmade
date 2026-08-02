'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Mail, CheckCircle2, ExternalLink, Loader2, Eye, User, Camera, Lock, BellOff, ChevronDown } from 'lucide-react';
import { Card, CardHeader, PageIn, PageTitle } from '@/components/admin/ui';

interface GmailStatus {
  connected: boolean;
  gmailAddress: string | null;
  connectedAt: string | null;
  willLandInGmailSent: boolean;
}

function ToggleRow({
  icon: Icon,
  label,
  subtitle,
  checked,
  disabled,
  onToggle,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  subtitle: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="w-full flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left hover:bg-white/[0.05] transition-colors disabled:opacity-50"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-sky-400/10 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-sky-300" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <span
        className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-gradient-to-r from-sky-400 to-purple-500' : 'bg-white/15'
        }`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  );
}

export default function AdminSettingsPage() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [gmailAddress, setGmailAddress] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGmailGuide, setShowGmailGuide] = useState(true);

  const [previewBeforeBulkSend, setPreviewBeforeBulkSend] = useState<boolean | null>(null);
  const [weeklyDigestOptOut, setWeeklyDigestOptOut] = useState<boolean | null>(null);
  const [savingPreference, setSavingPreference] = useState(false);

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const load = () => {
    fetch('/api/admin/settings/gmail')
      .then((r) => r.json())
      .then(setStatus);
    fetch('/api/admin/settings/preferences')
      .then((r) => r.json())
      .then((data) => {
        setPreviewBeforeBulkSend(data.previewBeforeBulkSend);
        setWeeklyDigestOptOut(data.weeklyDigestOptOut);
      });
    fetch('/api/admin/settings/profile')
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || '');
        setTitle(data.title || '');
        setAvatarUrl(data.avatarUrl || null);
      });
  };

  useEffect(load, []);

  const handleSaveProfile = async () => {
    if (!name.trim()) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      const res = await fetch('/api/admin/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, title }),
      });
      if (!res.ok) {
        const data = await res.json();
        setProfileError(data.error || 'Failed to save profile');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarSelected = async (file: File) => {
    setUploadingAvatar(true);
    setProfileError(null);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/admin/settings/avatar-upload',
      });
      const res = await fetch('/api/admin/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: blob.url }),
      });
      if (res.ok) {
        setAvatarUrl(blob.url);
      } else {
        const data = await res.json();
        setProfileError(data.error || 'Failed to save photo');
      }
    } catch {
      setProfileError('Failed to upload photo');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleTogglePreview = async () => {
    if (previewBeforeBulkSend === null) return;
    const next = !previewBeforeBulkSend;
    setPreviewBeforeBulkSend(next);
    setSavingPreference(true);
    try {
      await fetch('/api/admin/settings/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewBeforeBulkSend: next }),
      });
    } finally {
      setSavingPreference(false);
    }
  };

  const handleToggleDigest = async () => {
    if (weeklyDigestOptOut === null) return;
    const next = !weeklyDigestOptOut;
    setWeeklyDigestOptOut(next);
    setSavingPreference(true);
    try {
      await fetch('/api/admin/settings/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyDigestOptOut: next }),
      });
    } finally {
      setSavingPreference(false);
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

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/admin/settings/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordError(data.error || 'Failed to change password');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordChanged(true);
      setTimeout(() => setPasswordChanged(false), 4000);
    } finally {
      setChangingPassword(false);
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
          title="Profile"
          subtitle="Your name, title, and photo — shown in the footer and sign-off of every email you send."
        />
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            title="Change photo"
            className="relative shrink-0 w-16 h-16 rounded-full overflow-hidden border border-white/15 bg-white/5 flex items-center justify-center group disabled:opacity-50"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <User size={24} className="text-white/30" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            </span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleAvatarSelected(e.target.files[0])}
          />
          <div className="flex-1 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Your title (e.g. Director of Sales)"
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          {profileError ? <p className="text-xs text-red-400">{profileError}</p> : <span />}
          <button
            onClick={handleSaveProfile}
            disabled={savingProfile || !name.trim()}
            className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {savingProfile ? 'Saving...' : 'Save'}
          </button>
        </div>
      </Card>

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
        ) : status.willLandInGmailSent ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-200">
            <CheckCircle2 size={16} />
            Already covered — your org has Gmail sending set up for everyone, no personal setup needed.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <button
              onClick={() => setShowGmailGuide((v) => !v)}
              className="w-full flex items-center justify-between rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-left"
            >
              <span className="text-sm font-medium text-sky-200">How to find/create your Gmail App Password</span>
              <ChevronDown size={16} className={`text-sky-300 transition-transform ${showGmailGuide ? 'rotate-180' : ''}`} />
            </button>

            {showGmailGuide && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70 space-y-3">
                <p className="text-xs text-white/40">
                  An App Password is a 16-character code Google generates for one specific app — it's not your
                  regular Gmail password, and Google won't show it to you again once you close the page, so
                  copy it somewhere temporary (like a note) before pasting it below.
                </p>
                <ol className="list-decimal list-inside space-y-2.5">
                  <li>
                    First, make sure <strong className="text-white">2-Step Verification</strong> is turned on
                    for your Google account — App Passwords don't exist without it. Check at{' '}
                    <a
                      href="https://myaccount.google.com/security"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-300 hover:underline inline-flex items-center gap-1"
                    >
                      myaccount.google.com/security <ExternalLink size={10} />
                    </a>
                    . If it's off, turn it on first (you'll need your phone to confirm).
                  </li>
                  <li>
                    Go to{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-300 hover:underline inline-flex items-center gap-1"
                    >
                      myaccount.google.com/apppasswords <ExternalLink size={10} />
                    </a>{' '}
                    while signed into the Gmail account you want to send from.
                  </li>
                  <li>
                    Under "App name," type something like <strong className="text-white">Bothmade</strong> so
                    you recognize it later, then click <strong className="text-white">Create</strong>.
                  </li>
                  <li>
                    Google shows a 16-character password in a yellow box, grouped like{' '}
                    <code className="text-white/80 bg-white/10 px-1.5 py-0.5 rounded">abcd efgh ijkl mnop</code>.
                    Copy it — spaces don't matter, you can paste it with or without them.
                  </li>
                  <li>
                    Come back here, paste your Gmail address and that app password into the fields below, and
                    click <strong className="text-white">Connect Gmail</strong>.
                  </li>
                </ol>
                <div className="pt-2 border-t border-white/10">
                  <p className="text-xs font-semibold text-amber-300 mb-1.5">
                    Don't see "App Passwords" as an option at all?
                  </p>
                  <p className="text-xs text-white/50">
                    That almost always means one of two things: 2-Step Verification isn't actually on yet (go
                    back to step 1), or this is a <strong className="text-white/70">Google Workspace</strong>{' '}
                    account (like a @bothmade.studio address) where an admin has to explicitly allow app
                    passwords first. If that's the case, whoever manages{' '}
                    <a
                      href="https://admin.google.com/ac/security/lsa"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-300 hover:underline inline-flex items-center gap-1"
                    >
                      admin.google.com/ac/security/lsa <ExternalLink size={10} />
                    </a>{' '}
                    needs to enable "Allow users to manage their access to less secure apps" / app passwords
                    for your account specifically, then this option will appear.
                  </p>
                </div>
              </div>
            )}

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
            </div>

            {error && (
              <div className="rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2.5">
                <p className="text-xs text-red-300">{error}</p>
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

      <Card className="p-6 space-y-3">
        <CardHeader title="Notifications & sending" subtitle="Controls for automated emails and bulk sends." />
        <ToggleRow
          icon={Eye}
          label="Preview before bulk sending"
          subtitle="Show every recipient's subject and body before a batch cold-email send actually goes out."
          checked={!!previewBeforeBulkSend}
          disabled={previewBeforeBulkSend === null || savingPreference}
          onToggle={handleTogglePreview}
        />
        <ToggleRow
          icon={BellOff}
          label="Mute weekly digest email"
          subtitle="Skip the Friday summary email (new leads, revenue, overdue follow-ups). Everyone gets it by default."
          checked={!!weeklyDigestOptOut}
          disabled={weeklyDigestOptOut === null || savingPreference}
          onToggle={handleToggleDigest}
        />
      </Card>

      <Card className="p-6">
        <CardHeader title="Password" subtitle="Change the password you use to log in here." />
        <div className="mt-4 space-y-2.5">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min. 8 characters)"
            className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
          />
          {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
          {passwordChanged && (
            <p className="text-xs text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Password updated.
            </p>
          )}
          <button
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/15 py-2.5 text-sm font-semibold hover:bg-white/5 disabled:opacity-40 transition-colors"
          >
            {changingPassword ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
            {changingPassword ? 'Updating...' : 'Change password'}
          </button>
        </div>
      </Card>
    </PageIn>
  );
}
