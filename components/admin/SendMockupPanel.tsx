'use client';

import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { isValidEmail } from '@/lib/validation';
import { MOCKUP_KINDS, type MockupKind } from '@/lib/mockup-kinds';

/**
 * Send the folder, and decide where it goes.
 *
 * The address on a researched lead is nearly always info@ off their website
 * — a shared inbox somebody triages, where a mockup can sit unopened while
 * the pipeline records it as delivered. A rep who has been on the phone
 * often has the owner's own address by then, and the useful moment to use it
 * is this one.
 *
 * So the override is offered here rather than being a separate edit somebody
 * has to remember to make first. Using it replaces the address on the lead,
 * which the panel says out loud before the send rather than after: every
 * follow-up from here goes where this went, and the generic inbox this was
 * routed around does not quietly come back.
 */
export function SendMockupPanel({
  recipientName,
  company,
  emailOnFile,
  sending,
  notice,
  onSend,
  /**
   * Already gone once. Changes what the panel says, not what it does.
   *
   * A second send is nearly always because the first landed in a shared inbox
   * nobody opened — so the panel says that, next to the field that fixes it,
   * rather than repeating copy written for a first delivery.
   */
  resend = false,
  /**
   * This lead arrived with its own mockup email written for it — so that is
   * what goes, not the standard wording. Said here because it changes what
   * the prospect reads, and the rep should know which of the two they are
   * about to send before they press it, not after.
   */
  written = false,
}: {
  recipientName: string | null;
  company: string;
  emailOnFile: string | null;
  sending: boolean;
  notice: { tone: 'ok' | 'warn'; text: string } | null;
  onSend: (email?: string, kind?: MockupKind) => void;
  resend?: boolean;
  written?: boolean;
}) {
  // Opens by itself when there is no address at all, because then it is not
  // an override — it is the only way this send happens.
  const [overriding, setOverriding] = useState(!emailOnFile);
  const [email, setEmail] = useState('');
  /*
   * What was actually made.
   *
   * The standard email says the mockup is "a working preview, not a picture
   * of one". Once that was untrue, so the send button was correctly not
   * pressed and the whole tracked path was abandoned for one client. A claim
   * the email cannot always make belongs here as a choice rather than as a
   * reason to stop using the send.
   */
  const [kind, setKind] = useState<MockupKind>('preview');

  const typed = email.trim();
  const invalid = typed.length > 0 && !isValidEmail(typed);
  const target = overriding ? typed : emailOnFile ?? '';
  const replaces = overriding && typed.length > 0 && !invalid && typed !== emailOnFile;

  return (
    <div className="mb-4 rounded-xl border border-purple-400/25 bg-purple-400/[0.06] p-4">
      <p className="text-sm font-semibold mb-1">
        {resend ? 'Send it again' : `Send it to ${recipientName || company}`}
      </p>
      <p className="text-xs text-white/50 mb-3">
        {resend
          ? 'Mails the same folder on a fresh tracked link. If the first one went to a shared inbox, this is where you point it somewhere a person actually reads.'
          : 'Mails the folder on a tracked link, records that it went, and moves the stage. You will see here when they open it. The preview build is never sent.'}
      </p>

      <div className="mb-3 space-y-2">
        {emailOnFile && (
          <label className="flex items-start gap-2.5 text-xs cursor-pointer">
            <input
              type="radio"
              checked={!overriding}
              onChange={() => setOverriding(false)}
              className="mt-0.5 accent-purple-400"
            />
            <span>
              <span className="text-white/80">{emailOnFile}</span>
              <span className="block text-white/35">The address on file.</span>
            </span>
          </label>
        )}

        <label className="flex items-start gap-2.5 text-xs cursor-pointer">
          <input
            type="radio"
            checked={overriding}
            onChange={() => setOverriding(true)}
            className="mt-0.5 accent-purple-400"
          />
          <span>
            <span className="text-white/80">
              {emailOnFile ? 'A different address' : 'Add an address'}
            </span>
            <span className="block text-white/35">
              {emailOnFile
                ? 'Got the owner’s own address on a call? Use it — it becomes this lead’s address from here on.'
                : 'There is nothing on file yet. Whatever you put here becomes this lead’s address.'}
            </span>
          </span>
        </label>

        {overriding && (
          <div className="pl-6">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
              <Mail size={13} className="shrink-0 text-white/30" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !invalid && typed && onSend(typed, kind)}
                placeholder="tony@monogramcustomhomes.com"
                className="w-full bg-transparent text-xs text-white placeholder:text-white/25 focus:outline-none"
              />
            </div>
            {invalid && <p className="mt-1.5 text-xs text-amber-300">That is not an email address.</p>}
            {replaces && emailOnFile && (
              <p className="mt-1.5 text-xs text-white/40">
                Replaces {emailOnFile} on this lead. Everything after this goes to the new one.
              </p>
            )}
          </div>
        )}
      </div>

      {written && (
        <p className="mb-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-2 text-xs text-emerald-200/90">
          This lead has its own mockup email, written with the cold email that
          opened the conversation — that is what goes, in its own words. The
          preview before sending shows it.
        </p>
      )}

      {/* What it is, which decides what the standard email is allowed to say.
          A written one already says what it is in its own sentences, so this
          only decides the button and the subject there. */}
      <div className="mb-3 border-t border-white/10 pt-3">
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/40">What are you sending?</p>
        {MOCKUP_KINDS.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2.5 py-1 text-xs">
            <input
              type="radio"
              checked={kind === option.value}
              onChange={() => setKind(option.value)}
              className="mt-0.5 accent-purple-400"
            />
            <span>
              <span className="text-white/80">{option.label}</span>
              <span className="block text-white/35">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <button
        onClick={() => onSend(overriding ? typed : undefined, kind)}
        disabled={sending || !target || invalid}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-400 to-purple-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        <Send size={14} />
        {sending ? 'Sending…' : resend ? 'Send it again' : 'Send mockup to client'}
      </button>

      {notice && (
        <p className={`mt-2 text-xs ${notice.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
