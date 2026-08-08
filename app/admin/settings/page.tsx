'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { checkPasswordStrength, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import {
  Mail,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Eye,
  User,
  Camera,
  Lock,
  BellOff,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardHeader, PageIn, PageTitle, Badge, Kicker, BrandButton, inputClass } from '@/components/admin/ui';

interface GmailStatus {
  connected: boolean;
  connectedVia: 'oauth' | 'app-password' | null;
  gmailAddress: string | null;
  connectedAt: string | null;
  googleOAuthAvailable: boolean;
  willLandInGmailSent: boolean;
  canReadInbox: boolean;
  sendingCoveredOrgWide: boolean;
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
          checked ? 'bg-sky-400' : 'bg-white/15'
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

/**
 * A labelled password field.
 *
 * Three of these sat in a row with their names in `placeholder` alone, which
 * is the worst place for it here of anywhere in the app: a password field
 * renders dots, so the moment all three are filled they are three identical
 * rows with nothing to tell current from new from confirm. A screen reader
 * had it worse still — three unnamed password boxes.
 */
function PasswordField({
  id,
  label,
  hint,
  autoComplete,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  autoComplete: 'current-password' | 'new-password';
  value: string;
  onChange: (next: string) => void;
  className: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs text-white/40">
        {label}
      </label>
      {hint && <p className="mb-1.5 text-xs text-white/25">{hint}</p>}
      <input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    </div>
  );
}

export default function AdminSettingsPage() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [gmailAddress, setGmailAddress] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGmailGuide, setShowGmailGuide] = useState(false);
  const [showAppPasswordFallback, setShowAppPasswordFallback] = useState(false);
  const [oauthResult, setOauthResult] = useState<{ ok: boolean; reason?: string; bounceFolderFailed?: boolean } | null>(null);
  const [settingUpBounceFolder, setSettingUpBounceFolder] = useState(false);
  const [bounceFolderResult, setBounceFolderResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [oauthStartError, setOauthStartError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('gmailOauth');
    if (params.get('gmailOAuthError') === 'not_configured') {
      setOauthStartError(true);
      setShowAppPasswordFallback(true);
      window.history.replaceState(null, '', '/admin/settings');
    }
    if (!oauthStatus) return;
    const bounceFolderFailed = params.get('bounceFolder') === 'failed';
    setOauthResult({ ok: oauthStatus === 'success', reason: params.get('reason') || undefined, bounceFolderFailed });
    if (oauthStatus === 'success' && bounceFolderFailed) {
      setBounceFolderResult({ ok: false, message: "Couldn't set up the bounce folder automatically." });
    }
    window.history.replaceState(null, '', '/admin/settings');
  }, []);

  const [previewBeforeBulkSend, setPreviewBeforeBulkSend] = useState<boolean | null>(null);
  const [weeklyDigestOptOut, setWeeklyDigestOptOut] = useState<boolean | null>(null);
  const [savingPreference, setSavingPreference] = useState(false);

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  /** Only to fill the change-password form's hidden username field. */
  const [email, setEmail] = useState('');
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
        setEmail(data.email || '');
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

  const handleSetupBounceFolder = async () => {
    setSettingUpBounceFolder(true);
    setBounceFolderResult(null);
    try {
      const res = await fetch('/api/admin/settings/gmail-oauth/bounce-folder', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setBounceFolderResult({ ok: false, message: data.error || 'Failed to set it up' });
        return;
      }
      setBounceFolderResult({
        ok: true,
        message: data.alreadyExisted
          ? `Already set up — bounces route to "${data.labelName}".`
          : `Done — bounces now skip the inbox and land in "${data.labelName}".`,
      });
    } catch {
      setBounceFolderResult({ ok: false, message: 'Failed to set it up' });
    } finally {
      setSettingUpBounceFolder(false);
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
    // Same rules the server enforces — checked here only so the message
    // arrives before the round trip, never instead of it.
    const strength = checkPasswordStrength(newPassword, name);
    if (!strength.ok) {
      setPasswordError(strength.error || 'Choose a stronger password');
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-white/40">Loading settings…</p>
      </div>
    );
  }

  return (
    <PageIn className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-6">
      <div>
        <Kicker className="mb-2">Studio</Kicker>
        <PageTitle icon={Mail} title="Settings" />
      </div>

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
            aria-label="Change profile photo"
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
              className={inputClass}
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Your title (e.g. Director of Sales)"
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          {profileError ? <p className="text-xs text-red-400">{profileError}</p> : <span />}
          <BrandButton
            variant="primary"
            onClick={handleSaveProfile}
            disabled={savingProfile || !name.trim()}
            className="shrink-0"
          >
            {savingProfile ? 'Saving...' : 'Save'}
          </BrandButton>
        </div>
      </Card>

      <Card className="p-6">
        <CardHeader
          title="Email sending"
          subtitle="Connect your Gmail so client emails go out as you, and land in your own Sent folder."
          action={
            // Only green once this account can both send AND read — a
            // send-only account still has replies and bounces invisible,
            // which is exactly the state a reassuring green badge hid.
            status.canReadInbox ? (
              <Badge solid tone="emerald">Connected</Badge>
            ) : status.willLandInGmailSent ? (
              <Badge solid tone="amber">Send only</Badge>
            ) : (
              <Badge solid tone="amber">Not connected</Badge>
            )
          }
        />

        {oauthStartError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 text-xs text-amber-200">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Google sign-in isn't set up on this deployment yet, so that button couldn't continue — this needs
              GOOGLE_OAUTH_CLIENT_ID/SECRET adding to the deployment before it can work. The App Password steps
              below are open as a fallback, but they typically don't work for Workspace addresses like
              @bothmade.studio.
            </span>
          </div>
        )}

        {oauthResult && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
              oauthResult.ok
                ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200'
                : 'border-red-400/20 bg-red-400/5 text-red-300'
            }`}
          >
            {oauthResult.ok ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
            <span>
              {oauthResult.ok
                ? 'Google account connected — bounce notices will skip your inbox automatically.'
                : `Couldn't connect Google account${oauthResult.reason ? ` (${oauthResult.reason})` : ''}. Try again.`}
            </span>
          </div>
        )}

        {status.connected ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-emerald-200">
                <CheckCircle2 size={16} />
                <span>
                  Connected as {status.gmailAddress}
                  <span className="text-emerald-200/50">
                    {' '}
                    — via {status.connectedVia === 'oauth' ? 'Google sign-in' : 'App Password'}
                  </span>
                </span>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-xs text-white/40 hover:text-red-300 transition-colors"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>

            {status.connectedVia === 'oauth' && bounceFolderResult && !bounceFolderResult.ok && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-amber-200/80">
                    {bounceFolderResult.message} Bounce notices may still land in your inbox until this is set up.
                  </p>
                  <button
                    onClick={handleSetupBounceFolder}
                    disabled={settingUpBounceFolder}
                    className="shrink-0 px-3.5 py-2 rounded-xl border border-white/15 text-xs font-semibold hover:bg-white/5 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {settingUpBounceFolder ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              </div>
            )}
            {status.connectedVia === 'oauth' && bounceFolderResult?.ok && (
              <p className="text-xs text-emerald-300/70 px-1">{bounceFolderResult.message}</p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Sending and reading are separate capabilities. Org-wide
                delegation only carries the gmail.send scope, so this account
                can already send while still being blind to replies and
                bounces. Saying "already covered — no personal setup needed"
                full stop (as this branch used to) contradicted the call
                list's own "reconnect your email" prompt and sent people away
                thinking they were done. */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/[0.06]">
              <div className="flex items-start gap-2 px-4 py-3">
                {status.sendingCoveredOrgWide ? (
                  <>
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-300" />
                    <div>
                      <p className="text-sm text-emerald-200">Sending your emails — covered</p>
                      <p className="text-xs text-white/40 mt-0.5">
                        Your org has Gmail sending set up for everyone, so your emails already go out as you and
                        land in your own Sent folder. Nothing to do here.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-300" />
                    <div>
                      <p className="text-sm text-amber-200">Sending your emails — not connected</p>
                      <p className="text-xs text-white/40 mt-0.5">
                        Emails will go out from a shared address and won't appear in your own Sent folder.
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-start gap-2 px-4 py-3">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-300" />
                <div>
                  <p className="text-sm text-amber-200">Reading your inbox — not connected</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    This is the part that's still missing. Until it's connected, nothing can see who replied to
                    you or whose address bounced — so replies never reach the top of your call list, and dead
                    addresses keep getting emailed. Org-wide sending doesn't cover this; it needs your own
                    sign-in.
                  </p>
                </div>
              </div>
            </div>

            {status.googleOAuthAvailable ? (
              <a
                href="/api/admin/settings/gmail-oauth/start"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
              >
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4.5 24 4.5 12.9 4.5 4 13.4 4 24.5s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-4z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 12.5 24 12.5c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4.5 24 4.5c-7.5 0-14 4.1-17.7 10.2z" />
                  <path fill="#4CAF50" d="M24 44.5c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.4 35.6 26.8 36.5 24 36.5c-5.3 0-9.7-3.1-11.3-7.6l-6.6 5.1C9.9 40.3 16.4 44.5 24 44.5z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.4C41.4 35.9 44 30.7 44 24.5c0-1.3-.1-2.7-.4-4z" />
                </svg>
                Sign in with Google
              </a>
            ) : (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 text-xs text-amber-200/80">
                Google sign-in isn't set up on this deployment yet (needs GOOGLE_OAUTH_CLIENT_ID/SECRET) — see
                the App Password fallback below, though it may not work for Workspace addresses like
                @bothmade.studio.
              </div>
            )}

            <button
              onClick={() => setShowAppPasswordFallback((v) => !v)}
              className="w-full flex items-center justify-between text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              <span>Advanced: use an App Password instead (personal Gmail accounts only)</span>
              <ChevronDown size={14} className={`transition-transform ${showAppPasswordFallback ? 'rotate-180' : ''}`} />
            </button>

            {showAppPasswordFallback && (
              <div className="space-y-4 pt-1">
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 text-xs text-amber-200/80">
                  Most Google Workspace accounts (like @bothmade.studio) can't generate App Passwords at all —
                  Google requires "less secure app" access that Workspace admins can no longer grant. If that's
                  your account, use "Sign in with Google" above instead.
                </div>

                <button
                  onClick={() => setShowGmailGuide((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-left"
                >
                  <span className="text-sm font-medium text-sky-200">How to find/create a Gmail App Password</span>
                  <ChevronDown size={16} className={`text-sky-300 transition-transform ${showGmailGuide ? 'rotate-180' : ''}`} />
                </button>

                {showGmailGuide && (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70 space-y-3">
                    <p className="text-xs text-white/40">
                      An App Password is a 16-character code Google generates for one specific app — it's not
                      your regular Gmail password, and Google won't show it to you again once you close the
                      page, so copy it somewhere temporary (like a note) before pasting it below.
                    </p>
                    <ol className="list-decimal list-inside space-y-2.5">
                      <li>
                        First, make sure <strong className="text-white">2-Step Verification</strong> is turned
                        on for your Google account — App Passwords don't exist without it. Check at{' '}
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
                        Under "App name," type something like <strong className="text-white">Bothmade</strong>{' '}
                        so you recognize it later, then click <strong className="text-white">Create</strong>.
                      </li>
                      <li>
                        Google shows a 16-character password in a yellow box, grouped like{' '}
                        <code className="text-white/80 bg-white/10 px-1.5 py-0.5 rounded">abcd efgh ijkl mnop</code>.
                        Copy it — spaces don't matter, you can paste it with or without them.
                      </li>
                      <li>
                        Come back here, paste your Gmail address and that app password into the fields below,
                        and click <strong className="text-white">Connect Gmail</strong>.
                      </li>
                    </ol>
                    <div className="pt-2 border-t border-white/10">
                      <p className="text-xs font-semibold text-amber-300 mb-1.5">
                        Don't see "App Passwords" as an option at all?
                      </p>
                      <p className="text-xs text-white/50">
                        That almost always means one of two things: 2-Step Verification isn't actually on yet
                        (go back to step 1), or this is a <strong className="text-white/70">Google Workspace</strong>{' '}
                        account where an admin has to explicitly allow app passwords first — which, per{' '}
                        <a
                          href="https://support.google.com/accounts/answer/185833"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-300 hover:underline inline-flex items-center gap-1"
                        >
                          Google's own documentation <ExternalLink size={10} />
                        </a>
                        , Workspace accounts, Advanced Protection accounts, and security-key-only accounts may
                        not be able to enable at all — "Sign in with Google" above is the reliable path for
                        those.
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
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Gmail App Password</label>
                  <input
                    type="password"
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder="16-character app password"
                    className={inputClass}
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2.5">
                    <p className="text-xs text-red-300">{error}</p>
                  </div>
                )}

                <BrandButton
                  variant="quiet"
                  onClick={handleConnect}
                  disabled={connecting || !gmailAddress || !appPassword}
                  className="w-full flex items-center justify-center gap-2"
                >
                  {connecting ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                  {connecting ? 'Connecting...' : 'Connect Gmail'}
                </BrandButton>
              </div>
            )}
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
        {/*
          A real <form>, and every field says what it is to a password manager.

          It was three loose inputs in a div behind an onClick, with no
          `autocomplete` anywhere in this file or on the login page. Browsers
          decide whether to offer a saved password, whether to generate one,
          and — the part that bites — whether to prompt to UPDATE the stored
          credential, by reading exactly these attributes and by watching a
          form submit. Without them a change here succeeds, the manager keeps
          the old password, and the next login fails from the vault with
          nothing on screen having looked wrong.

          The hidden username field is the documented companion: a
          change-password form with no username gives the manager no way to
          know which saved entry this is, so it updates nothing.
        */}
        <form
          className="mt-4 space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void handleChangePassword();
          }}
        >
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
            aria-hidden="true"
            tabIndex={-1}
          />
          <PasswordField
            id="current-password"
            label="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            className={inputClass}
          />
          <PasswordField
            id="new-password"
            label="New password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            className={inputClass}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            className={inputClass}
          />
          {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
          {passwordChanged && (
            <p className="text-xs text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Password updated.
            </p>
          )}
          <BrandButton
            type="submit"
            variant="quiet"
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="w-full flex items-center justify-center gap-2"
          >
            {changingPassword ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
            {changingPassword ? 'Updating...' : 'Change password'}
          </BrandButton>
        </form>
      </Card>
    </PageIn>
  );
}
