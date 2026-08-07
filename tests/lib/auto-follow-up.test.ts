import { describe, expect, it } from 'vitest';
import {
  AUTO_FOLLOW_UP_DAYS,
  AUTO_FOLLOW_UP_TOTAL,
  autoFollowUpDueDate,
  autoFollowUpNextDue,
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

describe('when they go', () => {
  it('lands the first three days after the call', () => {
    const due = autoFollowUpDueDate(new Date('2026-08-07T10:00:00Z'));

    expect(AUTO_FOLLOW_UP_DAYS).toBe(3);
    expect(due.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  /**
   * Every step counted from the CALL, never from the email before it, so a
   * run delayed by a day does not drag the whole tail along with it.
   */
  it('walks day three, day five, day seven and then stops', () => {
    const call = new Date('2026-08-07T10:00:00Z');
    const days: string[] = [];

    let due: Date | null = autoFollowUpDueDate(call);
    let stage = 0;
    while (due) {
      days.push(due.toISOString().slice(0, 10));
      stage++;
      due = autoFollowUpNextDue(stage, due);
    }

    expect(days).toEqual(['2026-08-10', '2026-08-12', '2026-08-14']);
    expect(stage).toBe(3);
  });

  /** Null is what ends it — there is no separate finished flag to drift. */
  it('answers null once the last one has gone', () => {
    expect(autoFollowUpNextDue(3, new Date('2026-08-14T10:00:00Z'))).toBeNull();
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

  /** Within a stage, one wording for everybody. That was the ask. */
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

/**
 * Three emails doing three jobs.
 *
 * Three sends of the same nudge is the texture of a mail merge, and the
 * second one teaches the reader to stop opening them. The test that matters
 * is not that each reads well — it is that no two of them are the same.
 */
describe('the three of them', () => {
  const ctx = {
    company: 'Ridgeline Roofing',
    contactName: 'Dana',
    stopUrl: 'https://bothmade.studio/stop/tok',
    observation: 'the booking form 404s on a phone',
  };

  it('says something different every time', () => {
    const bodies = [1, 2, 3].map((s) => autoFollowUpEmail(ctx, s).html);
    const subjects = [1, 2, 3].map((s) => autoFollowUpEmail(ctx, s).subject);

    expect(new Set(bodies).size).toBe(AUTO_FOLLOW_UP_TOTAL);
    expect(new Set(subjects).size).toBe(AUTO_FOLLOW_UP_TOTAL);
  });

  it('opens on the call, then the observation, then the goodbye', () => {
    expect(autoFollowUpEmail(ctx, 1).html).toMatch(/we spoke on the phone/i);
    expect(autoFollowUpEmail(ctx, 2).html).toContain('the booking form 404s on a phone');
    expect(autoFollowUpEmail(ctx, 3).html).toMatch(/last one from me/i);
  });

  /** Every one of them stoppable, not just the first. */
  it('carries the unsubscribe on all three', () => {
    for (const stage of [1, 2, 3]) {
      expect(autoFollowUpEmail(ctx, stage).html, `stage ${stage}`).toContain(ctx.stopUrl);
    }
  });

  /** A stage past the end should never happen, and must not blank the email. */
  it('sends the closer rather than nothing if asked for a fourth', () => {
    expect(autoFollowUpEmail(ctx, 9).html).toMatch(/last one from me/i);
  });
});

/**
 * The day-five email, which is the only one that claims somebody looked.
 *
 * That claim has to be true. Most of this book has no written observation —
 * the field is filled by research, not by every import — so the fallback is
 * not an edge case, it is the common one, and it has to be a real email
 * rather than a sentence with a hole in it.
 */
describe('the one that names their site', () => {
  const base = {
    company: 'Ridgeline Roofing',
    contactName: 'Dana',
    stopUrl: 'https://bothmade.studio/stop/tok',
  };

  it('leads with what research wrote about them', () => {
    const { subject, html } = autoFollowUpEmail(
      { ...base, observation: 'the booking form 404s on a phone' },
      2
    );

    expect(html).toContain('the booking form 404s on a phone');
    expect(subject).toMatch(/one thing about the Ridgeline Roofing site/i);
  });

  it('sends a shorter one rather than a gap when nothing was written', () => {
    const { subject, html } = autoFollowUpEmail(base, 2);

    expect(html).not.toMatch(/stood out/i);
    expect(html).toMatch(/the offer stands/i);
    expect(subject).not.toMatch(/one thing about/i);
  });

  it('treats an empty observation the same as none at all', () => {
    expect(autoFollowUpEmail({ ...base, observation: '   ' }, 2).html).toMatch(
      /the offer stands/i
    );
  });

  /** Research text is somebody else's prose and it lands inside markup. */
  it('escapes the observation', () => {
    const { html } = autoFollowUpEmail(
      { ...base, observation: '<img src=x onerror=alert(1)>' },
      2
    );

    expect(html).not.toContain('<img');
  });
});
