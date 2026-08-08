import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_GUIDE } from '@/lib/notification-guide';

/**
 * The guide claims it cannot drift from vercel.json. Nothing was holding it.
 *
 * Two sentences in lib/notification-guide.ts state the intent outright:
 * "Adding an automatic notification without adding it here is the failure this
 * exists to prevent", and "Times are UTC because that is what Vercel Cron
 * schedules in — the same strings that appear in vercel.json, so the two cannot
 * drift."
 *
 * Both were untrue. Six jobs are scheduled in vercel.json and the guide
 * described four. The two missing were enquiry-nudge, which emails somebody
 * who filled in the contact form once a day for up to fourteen days, and
 * auto-follow-up, which sends cold follow-ups through `sendAsUser` — from the
 * rep's own Gmail, into their own Sent folder, up to forty leads a run.
 *
 * That is the worst possible thing to leave out of a document whose whole
 * purpose is answering "what happens without me asking". A rep who does not
 * know auto-follow-up runs can message a lead the same morning it did, or get a
 * reply to something they never wrote.
 *
 * So the coupling is enforced from the file rather than asserted in a comment:
 * every cron in vercel.json that notifies somebody must have a rule here, and
 * every clock time quoted here must be a time something is actually scheduled
 * for.
 */

const vercel = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')
) as { crons?: Array<{ path: string; schedule: string }> };

const crons = vercel.crons ?? [];
const rules = NOTIFICATION_GUIDE.flatMap((group) => group.rules);

/** "0 14 * * *" -> "2pm", the way the guide writes it. */
function scheduleToClock(schedule: string): string {
  const hour = Number(schedule.split(' ')[1]);
  if (!Number.isInteger(hour)) return '';
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

describe('the schedule the guide quotes', () => {
  it('reads vercel.json rather than a copy of it', () => {
    // Guards the guard: an empty cron list would make everything below pass.
    expect(crons.length).toBeGreaterThan(4);
    expect(rules.length).toBeGreaterThan(10);
  });

  it('quotes only times something is actually scheduled for', () => {
    // A rule saying "Daily, 2pm UTC" when nothing runs at 14:00 is worse than
    // no rule: somebody waits for an email that is never coming.
    const scheduled = new Set(crons.map((c) => scheduleToClock(c.schedule)));

    const quoted = rules
      .map((r) => /(\d{1,2}(?:am|pm))\s*UTC/i.exec(r.timing)?.[1]?.toLowerCase())
      .filter((t): t is string => Boolean(t));

    expect(quoted.length, 'no rule quotes a clock time — the regex has rotted').toBeGreaterThan(3);
    for (const time of quoted) {
      expect(scheduled.has(time), `the guide says ${time} UTC and nothing is scheduled then`).toBe(
        true
      );
    }
  });

  it('has a rule for every scheduled job that notifies somebody', () => {
    /*
     * Keyed by the hour, which is what the guide exposes. Two jobs sharing an
     * hour (stale-leads and weekly-digest both run at 14:00, daily and Friday)
     * are both covered by any rule quoting 2pm, so this checks that no
     * scheduled hour is undescribed rather than matching job to rule — the
     * latter would need the guide to name endpoints, which is not what it is
     * for.
     */
    const describedHours = new Set(
      rules
        .map((r) => /(\d{1,2}(?:am|pm))\s*UTC/i.exec(r.timing)?.[1]?.toLowerCase())
        .filter(Boolean)
    );

    const undescribed = crons
      .map((c) => ({ ...c, clock: scheduleToClock(c.schedule) }))
      .filter((c) => !describedHours.has(c.clock));

    expect(
      undescribed.map((c) => `${c.path} at ${c.clock}`),
      'these run on a schedule and the guide does not mention anything at that time'
    ).toEqual([]);
  });
});

describe('the two that were missing', () => {
  it('describes the cold follow-up sequence, and that it sends as you', () => {
    // The detail that matters: it goes from the rep's own mailbox, not the
    // studio's shared sender.
    const rule = rules.find((r) => /follow-?ups? is sent|three follow-ups/i.test(r.tells));
    expect(rule, 'no rule describes auto-follow-up').toBeDefined();
    expect(rule!.tells).toMatch(/your own Gmail/i);
    expect(rule!.timing).toMatch(/4pm UTC/);
  });

  it('describes the enquiry nudge, including where it stops', () => {
    // A daily email needs its brake documented, or the reasonable assumption
    // is that it runs forever.
    const rule = rules.find((r) => /nudged once a day/i.test(r.tells));
    expect(rule, 'no rule describes enquiry-nudge').toBeDefined();
    expect(rule!.tells).toMatch(/14/);
    expect(rule!.timing).toMatch(/3pm UTC/);
  });
});

describe('every rule is usable as written', () => {
  it('says what happens, what you get, and when', () => {
    for (const rule of rules) {
      expect(rule.trigger.trim().length, JSON.stringify(rule)).toBeGreaterThan(10);
      expect(rule.tells.trim().length, JSON.stringify(rule)).toBeGreaterThan(10);
      expect(rule.timing.trim().length, JSON.stringify(rule)).toBeGreaterThan(3);
    }
  });

  it('names at least one place the notification appears', () => {
    // A rule with no `where` is a promise with no address.
    for (const rule of rules) {
      expect(rule.where.length, rule.trigger).toBeGreaterThan(0);
      for (const where of rule.where) {
        expect(['dashboard', 'email', 'bell', 'screen']).toContain(where);
      }
    }
  });
});
