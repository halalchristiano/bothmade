/**
 * Why the automated follow-ups are not sending, in a sentence somebody can act
 * on — and somewhere they will actually see it.
 *
 * The cron already refuses correctly and already explains itself. `/api/cron/
 * auto-follow-up` returns a 503 naming the mailbox and listing the three ways
 * out ("Add it under Team, connect its Gmail, or point AUTO_FOLLOW_UP_FROM
 * somewhere else"). The problem is where that sentence goes: into Vercel's cron
 * log, which nobody opens. So the job can sit refusing to run every weekday for
 * weeks, the sequence quietly stops advancing, and the only symptom is leads
 * that were spoken to on the phone never hearing back.
 *
 * That is the worst shape a scheduled job can fail in. A crash gets noticed. A
 * job that declines to start, on purpose, with a good reason, filed somewhere
 * with no reader, does not.
 *
 * This is deliberately a pure function over what the caller already looked up,
 * rather than a module that queries. The notifications route is the only caller
 * and it is already holding a Prisma client; this just decides what to say.
 *
 * ## Why the mailbox is on a different domain
 *
 * `AUTO_FOLLOW_UP_FROM` defaults to an address on the studio's *secondary*
 * sending domain, not the one the site and the invoices use. That is
 * deliberate and lib/auto-follow-up.ts explains it: these are automated,
 * cold-ish emails, and they must not go out from a mailbox whose reputation
 * the invoices depend on. So an address that looks like a typo of the main
 * domain is not one, and the fix is never to "correct" it here.
 */

export type OutreachBlockReason = 'no-account' | 'no-gmail';

export interface OutreachSenderAccount {
  /** The address the account signs in with. */
  email: string;
  /** The Gmail address connected under Settings, when one is. */
  gmailAddress: string | null;
  /** Encrypted app password, when that is how the mailbox is connected. */
  gmailAppPassword: string | null;
  /** Encrypted OAuth refresh token, when that is how it is connected. */
  googleRefreshToken: string | null;
}

export interface OutreachBlocker {
  reason: OutreachBlockReason;
  label: string;
  detail: string;
  href: string;
}

/**
 * Is this account able to send as the outreach mailbox?
 *
 * Either connection route counts. The App Password path still works for
 * personal Gmail, and OAuth is what Workspace accounts use — the mailer tries
 * them in that order and falls back, so requiring a specific one here would
 * report a working setup as broken.
 */
export function canSendOutreach(account: OutreachSenderAccount | null): boolean {
  if (!account) return false;
  return Boolean(account.gmailAppPassword || account.googleRefreshToken);
}

/**
 * What is stopping the follow-ups, or null when nothing is.
 *
 * `senderEmail` is what `autoFollowUpSender()` returned, and `account` is the
 * user row matching it — the same lookup the cron does, by `gmailAddress` OR
 * `email`, because the mailbox may be connected to an account that signs in
 * under a different address.
 */
export function autoFollowUpBlocker(
  senderEmail: string,
  account: OutreachSenderAccount | null
): OutreachBlocker | null {
  if (!account) {
    return {
      reason: 'no-account',
      label: 'Automated follow-ups are not sending',
      // Names the address, because the whole difficulty is that it is not the
      // one anybody would guess — it is on the secondary sending domain.
      detail: `No team account has ${senderEmail}. Add it under Team, then connect its Gmail.`,
      href: '/admin/team',
    };
  }

  if (!canSendOutreach(account)) {
    return {
      reason: 'no-gmail',
      label: 'Automated follow-ups are not sending',
      detail: `${senderEmail} exists but its Gmail is not connected. Connect it under Settings.`,
      href: '/admin/settings',
    };
  }

  return null;
}
