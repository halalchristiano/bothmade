import { describe, expect, it } from 'vitest';
import { warrantyState, WARRANTY_DAYS } from '@/lib/launch';
import { deliverableHref } from '@/lib/deliverables';
import { BounceWatch, BOUNCE_WATCH_MIN_SAMPLE, BOUNCE_HALT_RATE } from '@/lib/send-safety';

/**
 * Four boundaries a mutation sweep proved nothing was holding.
 *
 * Thirty operator flips across ten non-billing libraries, one at a time, each
 * run against that library's own tests. Twenty-five were caught. These four
 * were not — every one of them a comparison whose two sides mean genuinely
 * different things, in code whose surrounding behaviour is otherwise well
 * covered. Nothing here is a bug: the code is right, the boundary just had
 * nothing pinned to it, which is how a later edit moves one by accident.
 *
 * Each test below names the mutation it kills.
 */

describe('the day a warranty runs out', () => {
  const END = new Date('2026-08-08T00:00:00Z');

  /**
   * `daysLeft <= 0` → `< 0` survived.
   *
   * `daysLeft` is a Math.ceil of the remaining milliseconds, so it reaches
   * exactly 0 only once the end has actually passed. Relaxed to `< 0`, that
   * moment reports `active: true` with `daysLeft: 0` — a warranty that is
   * live and has no days left, which is not a state, and a client's dashboard
   * offering free fixes on work the contract stopped covering.
   */
  it('is over the moment it is reached, not the day after', () => {
    const atTheInstant = warrantyState(END, END);

    expect(atTheInstant.active).toBe(false);
    expect(atTheInstant.daysLeft).toBe(0);
    expect(atTheInstant.clientLine).toContain('ran to');
  });

  it('is over a second later too', () => {
    expect(warrantyState(END, new Date(END.getTime() + 1_000)).active).toBe(false);
  });

  /** And genuinely live with a day still on it, or the boundary is meaningless. */
  it('is live with a day left', () => {
    const state = warrantyState(END, new Date('2026-08-07T00:00:00Z'));

    expect(state.active).toBe(true);
    expect(state.daysLeft).toBe(1);
  });

  it('says the warranty has not started when there is no end date', () => {
    const state = warrantyState(null);

    expect(state.active).toBe(false);
    expect(state.clientLine).toMatch(/starts the day/i);
    expect(WARRANTY_DAYS).toBe(30);
  });
});

describe('rescuing a pasted link that is not a full URL', () => {
  /**
   * `looks like a host && has no whitespace` → `||` survived.
   *
   * Both halves are load-bearing and they guard opposite mistakes. Turned into
   * an `or`, anything without a space becomes a link — so a deliverable
   * somebody labelled `TBC` or `n/a` is rendered as a clickable
   * `https://TBC`, which is a broken link presented to a client as a file
   * they can open.
   */
  it('rescues a bare host somebody pasted', () => {
    expect(deliverableHref('example.com/brief.pdf')).toBe('https://example.com/brief.pdf');
    expect(deliverableHref('example.com')).toBe('https://example.com');
  });

  it('refuses a word with no dot in it, however tidy', () => {
    expect(deliverableHref('TBC')).toBeNull();
    expect(deliverableHref('pending')).toBeNull();
  });

  it('refuses a sentence, even one containing a domain', () => {
    expect(deliverableHref('ask sam for the example.com link')).toBeNull();
  });

  it('still takes an absolute URL as it stands', () => {
    expect(deliverableHref('https://drive.google.com/x')).toBe('https://drive.google.com/x');
  });

  /** And nothing that is not a string at all — this reads a Json column. */
  it('refuses anything that is not a string', () => {
    expect(deliverableHref(null)).toBeNull();
    expect(deliverableHref(42)).toBeNull();
    expect(deliverableHref('   ')).toBeNull();
  });
});

describe('the sample a bounce rate needs before it means anything', () => {
  const watch = (attempted: number, failed: number) => {
    const w = new BounceWatch();
    for (let i = 0; i < attempted; i++) w.record(i >= failed);
    return w.verdict();
  };

  /**
   * `attempted >= BOUNCE_WATCH_MIN_SAMPLE` → `>` survived.
   *
   * The exact-sample case is the whole point of having a threshold: at 12
   * attempts the ratio is finally worth acting on, and one attempt later is
   * one more message sent from an account the provider is already unhappy
   * about. Nothing tested the boundary itself, only either side of it.
   */
  it('halts on exactly the minimum sample', () => {
    const v = watch(BOUNCE_WATCH_MIN_SAMPLE, Math.ceil(BOUNCE_WATCH_MIN_SAMPLE * BOUNCE_HALT_RATE));

    expect(v.attempted).toBe(BOUNCE_WATCH_MIN_SAMPLE);
    expect(v.halt).toBe(true);
    expect(v.reason).toContain('refused by the mail server');
  });

  it('stays quiet one attempt short of it, however bad the ratio', () => {
    const v = watch(BOUNCE_WATCH_MIN_SAMPLE - 1, BOUNCE_WATCH_MIN_SAMPLE - 1);

    expect(v.rate).toBe(1);
    expect(v.halt).toBe(false);
  });

  /** The rate boundary is the same kind of edge and deserves the same pin. */
  it('halts on exactly the halt rate, not only above it', () => {
    const failed = 20 * BOUNCE_HALT_RATE;
    const v = watch(20, failed);

    expect(v.rate).toBe(BOUNCE_HALT_RATE);
    expect(v.halt).toBe(true);
  });

  it('lets a batch just under the rate run on', () => {
    const v = watch(20, 20 * BOUNCE_HALT_RATE - 1);

    expect(v.rate).toBeLessThan(BOUNCE_HALT_RATE);
    expect(v.halt).toBe(false);
  });
});
