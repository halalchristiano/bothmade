import { describe, expect, it } from 'vitest';
import { autoFollowUpBlocker, canSendOutreach } from '@/lib/outreach-health';
import { autoFollowUpSender } from '@/lib/auto-follow-up';

/**
 * The follow-up cron has been declining to run, correctly, into a log with no
 * reader.
 *
 * /api/cron/auto-follow-up returns a 503 naming the mailbox and listing the
 * three ways out. That sentence goes to Vercel's cron log. Nobody opens it. So
 * the job can refuse every weekday for weeks, the sequence stops advancing,
 * and the only symptom is leads who were spoken to on the phone never hearing
 * back — which is indistinguishable from the sequence having finished.
 *
 * A job that crashes gets noticed. A job that declines to start on purpose,
 * with a good reason, filed somewhere nobody reads, does not. This is the
 * check that puts it in front of somebody.
 */

const CONNECTED_APP_PASSWORD = {
  email: 'kiana@bothmadestudio.com',
  gmailAddress: 'kiana@bothmadestudio.com',
  gmailAppPassword: 'encrypted',
  googleRefreshToken: null,
};

const CONNECTED_OAUTH = {
  email: 'kiana@bothmadestudio.com',
  gmailAddress: 'kiana@bothmadestudio.com',
  gmailAppPassword: null,
  googleRefreshToken: 'encrypted',
};

const ACCOUNT_NO_GMAIL = {
  email: 'kiana@bothmadestudio.com',
  gmailAddress: null,
  gmailAppPassword: null,
  googleRefreshToken: null,
};

const SENDER = 'kiana@bothmadestudio.com';

describe('when no account holds the outreach mailbox', () => {
  it('says so, and names the address', () => {
    // Naming it is the point. It is on the studio's secondary sending domain,
    // not the one the site and invoices use, so it is not an address anybody
    // would guess from the rest of the admin.
    const blocked = autoFollowUpBlocker(SENDER, null);

    expect(blocked?.reason).toBe('no-account');
    expect(blocked?.detail).toContain(SENDER);
  });

  it('points at Team, which is where an account is made', () => {
    expect(autoFollowUpBlocker(SENDER, null)?.href).toBe('/admin/team');
  });
});

describe('when the account exists but cannot send', () => {
  /**
   * This used to point at Settings, and the reasoning was right but the
   * destination was not: it is a different problem with a different fix, and
   * sending somebody to Team to create an account that already exists is how
   * a setup task gets abandoned.
   *
   * Settings only ever connects the mailbox of whoever is signed in. For any
   * address that is not yours — and the outreach sender is deliberately not
   * anybody's, it is its own account on the secondary sending domain — that
   * link was a dead end: you arrived at a page showing your own mailbox,
   * already connected, with nothing on it to do. The only route through was to
   * sign out and sign back in as that account, which nothing said anywhere.
   *
   * Team now carries a Connect Gmail control per row, so the fix and the place
   * you are sent are the same place.
   */
  it('says that instead, and points at Team, where the control now is', () => {
    const blocked = autoFollowUpBlocker(SENDER, ACCOUNT_NO_GMAIL);

    expect(blocked?.reason).toBe('no-gmail');
    expect(blocked?.href).toBe('/admin/team');
    expect(blocked?.detail).toMatch(/Connect Gmail/);
    // And says you do not have to become somebody else to do it — the part
    // that was missing for weeks.
    expect(blocked?.detail).toMatch(/signed in as yourself/);
    expect(blocked?.detail).toContain(SENDER);
  });
});

describe('when it is properly set up', () => {
  it('says nothing at all', () => {
    expect(autoFollowUpBlocker(SENDER, CONNECTED_APP_PASSWORD)).toBeNull();
  });

  it('accepts either way of connecting the mailbox', () => {
    // The mailer tries delegation, then OAuth, then an App Password, then
    // Resend. Requiring one specific route here would report a working setup
    // as broken — and a false alarm on a permanent banner is worse than none,
    // because it teaches people to ignore the bell.
    expect(canSendOutreach(CONNECTED_APP_PASSWORD)).toBe(true);
    expect(canSendOutreach(CONNECTED_OAUTH)).toBe(true);
    expect(autoFollowUpBlocker(SENDER, CONNECTED_OAUTH)).toBeNull();
  });

  it('treats a bare account with no connection as unable to send', () => {
    expect(canSendOutreach(ACCOUNT_NO_GMAIL)).toBe(false);
    expect(canSendOutreach(null)).toBe(false);
  });
});

describe('the address it reports', () => {
  it('is whatever the cron would actually use', () => {
    // The check and the cron must never disagree about which mailbox is
    // expected, or the banner sends somebody to configure the wrong one.
    const blocked = autoFollowUpBlocker(autoFollowUpSender(), null);
    expect(blocked?.detail).toContain(autoFollowUpSender());
  });

  it('is on the secondary sending domain, which is deliberate', () => {
    // Pinned so nobody "fixes" it to bothmade.studio. lib/auto-follow-up.ts:
    // these are automated cold-ish emails and must not go out from a mailbox
    // whose reputation the invoices depend on.
    expect(autoFollowUpSender()).not.toContain('@bothmade.studio');
  });
});
