import { describe, expect, it } from 'vitest';
import {
  AUTO_FOLLOW_UP_DAYS,
  autoFollowUpDueDate,
  autoFollowUpEmail,
  autoFollowUpSender,
  callEarnsAutoFollowUp,
} from '@/lib/auto-follow-up';
import { CALL_OUTCOMES, findCallOutcome } from '@/lib/call-outcomes';

/**
 * The second email, and who is allowed to receive it.
 *
 * This is the only thing in the app that emails a stranger without anybody
 * pressing a button, so what is pinned here is mostly what it must NOT do:
 * never claim a conversation that did not happen, never chase somebody who
 * said no, and never be hard to stop.
 */

describe('which calls earn one', () => {
  /**
   * The whole email opens "we spoke on the phone a few days ago". Sent to
   * somebody who never picked up, that is a lie they will notice — and being
   * caught in one is worth more than the email could ever return.
   */
  it('refuses a call nobody answered', () => {
    for (const key of ['no-answer', 'voicemail', 'gatekeeper', 'wrong-number']) {
      const outcome = findCallOutcome(key)!;
      expect(callEarnsAutoFollowUp(outcome), key).toBe(false);
    }
  });

  it('takes a call where somebody actually spoke', () => {
    for (const key of ['spoke-callback', 'spoke-interested', 'sending-proposal', 'meeting-booked']) {
      const outcome = findCallOutcome(key)!;
      expect(callEarnsAutoFollowUp(outcome), key).toBe(true);
    }
  });

  /** Emailing three days after a flat no is how you get reported as spam. */
  it('refuses a clear no even though they spoke', () => {
    expect(callEarnsAutoFollowUp({ spokeToThem: true, status: 'lost' })).toBe(false);
  });

  /**
   * Every outcome has to answer the question one way or the other. A new one
   * added without thinking about it defaults to silence, which is the safe
   * direction — but it should be a decision, not an omission.
   */
  it('leaves no outcome undecided', () => {
    for (const o of CALL_OUTCOMES) {
      expect(typeof callEarnsAutoFollowUp(o), o.key).toBe('boolean');
    }
  });
});

describe('when it goes', () => {
  it('lands three days after the call', () => {
    const due = autoFollowUpDueDate(new Date('2026-08-07T10:00:00Z'));

    expect(AUTO_FOLLOW_UP_DAYS).toBe(3);
    expect(due.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  /** Keeps the time of day, so a call at 4pm is followed up at 4pm. */
  it('does not slide to midnight', () => {
    const from = new Date('2026-08-07T16:30:00Z');
    expect(autoFollowUpDueDate(from).getTime() - from.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
  });
});

describe('who it comes from', () => {
  /**
   * Its own setting rather than "whoever made the call". These go out
   * automatically at a fixed time, and the mailbox that sends them must be
   * the one chosen for it — not one under a restriction, and not one being
   * warmed for something else.
   */
  it('defaults to the address on the secondary sending domain', () => {
    delete process.env.AUTO_FOLLOW_UP_FROM;
    expect(autoFollowUpSender()).toBe('kiana@bothmadestudio.com');
  });

  it('can be moved without a deploy', () => {
    process.env.AUTO_FOLLOW_UP_FROM = 'Info@Bothmade.Studio';
    expect(autoFollowUpSender()).toBe('info@bothmade.studio');
    delete process.env.AUTO_FOLLOW_UP_FROM;
  });
});

describe('the email itself', () => {
  const ctx = {
    company: 'Ridgeline Roofing',
    contactName: 'Dana Whitmore',
    stopUrl: 'https://bothmade.studio/stop/tok123',
  };

  it('opens on their first name and names the business', () => {
    const { subject, html } = autoFollowUpEmail(ctx);

    expect(html).toContain('Hi Dana,');
    expect(subject).toContain('Ridgeline Roofing');
  });

  it('falls back to "there" rather than printing an empty name', () => {
    expect(autoFollowUpEmail({ ...ctx, contactName: null }).html).toContain('Hi there,');
  });

  /**
   * A plain sentence in the body, not grey type at the bottom. These go out
   * without anybody pressing send, so somebody who wants them to stop should
   * not have to hunt — and a spam complaint costs far more than a lost lead.
   */
  it('carries a one-click stop in the body', () => {
    const { html } = autoFollowUpEmail(ctx);

    expect(html).toContain(ctx.stopUrl);
    expect(html).toMatch(/rather we stopped/i);
  });

  /** A company name is somebody else's text, and it lands inside markup. */
  it('escapes a name that would otherwise inject markup', () => {
    const { html } = autoFollowUpEmail({
      ...ctx,
      company: '<script>alert(1)</script>',
      contactName: '<b>Dana',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Dana');
  });

  /** Asked for as one wording for everybody, and checked as one. */
  it('is the same email for everyone but the name', () => {
    const a = autoFollowUpEmail(ctx).html.replace(/Dana|Ridgeline Roofing/g, '');
    const b = autoFollowUpEmail({
      company: 'Cascade Dental',
      contactName: 'Sam',
      stopUrl: ctx.stopUrl,
    }).html.replace(/Sam|Cascade Dental/g, '');

    expect(a).toBe(b);
  });
});
