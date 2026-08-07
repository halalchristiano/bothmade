import { describe, expect, it } from 'vitest';
import { nextTouch, touchDay } from '@/lib/next-touch';

/**
 * The sentence that answers "is this one handled?".
 *
 * The call sheet was never stressful because of its length. It was stressful
 * because four separate facts decide whether a lead is taken care of — the
 * band, the follow-up date, the automated email queue and the mockup state —
 * and they lived in four places, so the only honest way to know was to open
 * the lead and work it out. Nobody does that forty times a morning, so the
 * real answer was a nagging feeling that something was being dropped.
 *
 * Every case here is one of those combinations, and the one that matters most
 * is the last: nothing scheduled at all, which used to look identical to
 * everything being fine.
 */

const NOW = new Date('2026-08-07T12:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const lead = (over: Partial<Parameters<typeof nextTouch>[0]> = {}) => ({
  reason: 'scheduled',
  nextFollowUpAt: null,
  autoFollowUpDueAt: null,
  autoFollowUpStage: 0,
  mockupRequested: false,
  mockupSentAt: null,
  ...over,
});

describe('a lead on the sheet right now', () => {
  /**
   * Everything scheduled is irrelevant while the answer to "what next" is
   * "you, in a minute". Printing a date under four hundred rows that all say
   * the same thing teaches people to skip the line.
   */
  it('says so and nothing else', () => {
    const t = nextTouch(lead({ reason: 'opened', nextFollowUpAt: inDays(4) }), NOW);

    expect(t.kind).toBe('now');
    expect(t.line).toBe('On your sheet now');
  });
});

describe('a lead waiting on a mockup', () => {
  /**
   * Outranks a booked date, because it is the only state where the next move
   * belongs to us rather than to a calendar. "You're ringing them Thursday"
   * about somebody waiting on a mockup is true and useless.
   */
  it('says the work is what they are waiting for', () => {
    const t = nextTouch(
      lead({ reason: 'awaiting-mockup', mockupRequested: true, nextFollowUpAt: inDays(2) }),
      NOW
    );

    expect(t.kind).toBe('mockup');
    expect(t.line).toMatch(/waiting on their mockup/i);
  });

  it('stops saying it once the mockup has gone out', () => {
    const t = nextTouch(
      lead({ mockupRequested: true, mockupSentAt: inDays(-1), nextFollowUpAt: inDays(3) }),
      NOW
    );

    expect(t.kind).toBe('call');
  });
});

describe('a lead with something booked', () => {
  it('names the day somebody is ringing them', () => {
    expect(nextTouch(lead({ nextFollowUpAt: inDays(1) }), NOW).line).toBe(
      "You're ringing them tomorrow"
    );
  });

  it('names the day the machine writes to them, and how many are left', () => {
    const t = nextTouch(lead({ autoFollowUpDueAt: inDays(1), autoFollowUpStage: 0 }), NOW);

    expect(t.kind).toBe('email');
    expect(t.line).toMatch(/automated email tomorrow \(2 left\)/i);
  });

  /** The last one is worth saying out loud — after it, nothing follows. */
  it('says when an email is the final one', () => {
    const t = nextTouch(lead({ autoFollowUpDueAt: inDays(4), autoFollowUpStage: 1 }), NOW);

    expect(t.line).toMatch(/last one/i);
  });

  /**
   * Both, because they are different promises to different people: one is a
   * call the rep owes, the other is an email going out whether or not anybody
   * remembers. Showing only the nearer one hides the other entirely.
   */
  it('carries both when both are scheduled', () => {
    const t = nextTouch(
      lead({ nextFollowUpAt: inDays(5), autoFollowUpDueAt: inDays(1) }),
      NOW
    );

    expect(t.kind).toBe('call-and-email');
    expect(t.line).toMatch(/ringing them/i);
    expect(t.line).toMatch(/automated email/i);
  });

  /** A finished sequence is not a scheduled email, whatever the date says. */
  it('ignores a stale date once both emails have gone', () => {
    const t = nextTouch(lead({ autoFollowUpDueAt: inDays(1), autoFollowUpStage: 2 }), NOW);

    expect(t.kind).toBe('nothing');
  });
});

describe('a lead nothing is going to happen to', () => {
  /**
   * The state this whole thing exists to make visible. No date, no email,
   * nobody coming back — and until now indistinguishable from a lead that was
   * handled, which is how a book of two thousand ends up with a few hundred
   * nobody has thought about since March.
   */
  it('says so plainly and asks to be noticed', () => {
    const t = nextTouch(lead(), NOW);

    expect(t.kind).toBe('nothing');
    expect(t.line).toMatch(/nothing scheduled/i);
    expect(t.needsAttention).toBe(true);
  });

  it('is the only state that asks to be noticed', () => {
    for (const l of [
      lead({ reason: 'opened' }),
      lead({ nextFollowUpAt: inDays(2) }),
      lead({ autoFollowUpDueAt: inDays(2) }),
      lead({ reason: 'awaiting-mockup', mockupRequested: true }),
    ]) {
      expect(nextTouch(l, NOW).needsAttention).toBe(false);
    }
  });
});

/**
 * Read while a phone is ringing. "Tomorrow" is understood instantly; "15 Aug"
 * has to be checked against today's date, which is a small tax paid several
 * hundred times a week.
 */
describe('how a day is written', () => {
  it('prefers the words for the days that have them', () => {
    expect(touchDay(NOW, NOW)).toBe('today');
    expect(touchDay(inDays(1), NOW)).toBe('tomorrow');
    expect(touchDay(inDays(-1), NOW)).toBe('yesterday');
  });

  /** An overdue date has to read as overdue, not as an ordinary Tuesday. */
  it('counts backwards for a date that has passed', () => {
    expect(touchDay(inDays(-4), NOW)).toBe('4 days ago');
  });

  it('gives a weekday and a date once it is far enough out', () => {
    // Locale decides the order; what matters is that all three parts are there.
    const out = touchDay(inDays(5), NOW);
    expect(out).toMatch(/Wed/);
    expect(out).toMatch(/Aug/);
    expect(out).toMatch(/12/);
  });

  /**
   * A follow-up stored at UTC midnight is still "tomorrow" to a rep in New
   * York, and calling it "today" would put a promise a day early.
   */
  it('compares whole days rather than hours', () => {
    const lateTonight = new Date(NOW);
    lateTonight.setHours(23, 59, 0, 0);
    expect(touchDay(lateTonight, NOW)).toBe('today');
  });
});
