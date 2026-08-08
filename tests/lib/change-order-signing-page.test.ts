import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * Two things on the page where a client agrees to pay more, read on a phone.
 *
 * Measured in Chromium at 390px against the real page:
 *
 *   "already settled or invoiced"   2 line boxes  — split mid-phrase
 *   "This isn't right — decline it" 157 × 20      — under WCAG 2.5.8's 24px
 *
 * The first is the one that misreads. The note is a plain inline continuation
 * of the payment's label, so at 390px it broke wherever it happened to land:
 * "already settled" stayed on Payment 1's line and "or invoiced" dropped
 * underneath, flush left, with only 12px of row spacing beneath it. It stopped
 * looking like a note about Payment 1 and started looking like a fourth row of
 * the schedule — on the one card whose job is to answer "what will I actually
 * be asked for, and when".
 *
 * The second is the same 20px control this repo has now fixed three times, in
 * the place it matters most: it is the only way to say no on a document that
 * changes what somebody pays.
 *
 * jsdom has no layout engine, so what is held here is the rule that produced
 * the measurement, not the measurement.
 */

const PAGE = 'app/change/[token]/page.tsx';

const read = () => readFile(PAGE, 'utf8');

/** The className of the element a marker sits inside, searching backwards. */
const classBefore = (src: string, marker: string): string => {
  const at = src.indexOf(marker);
  expect(at, `could not find ${marker}`).toBeGreaterThan(-1);
  const open = src.lastIndexOf('className=', at);
  expect(open, `no className before ${marker}`).toBeGreaterThan(-1);
  return src.slice(open, at);
};

describe('the revised payment schedule', () => {
  /**
   * `whitespace-nowrap` is what stops the split, and `inline-block` is what
   * makes it stick: `whitespace-nowrap` alone on a plain inline span still
   * lets the box fragment across line boxes in some engines, and an
   * inline-block is atomic by definition.
   */
  it('keeps the frozen-payment note in one piece when it wraps', async () => {
    const cls = classBefore(await read(), 'already settled or invoiced');

    expect(cls, 'the note can split mid-phrase — it measured 2 line boxes at 390px').toMatch(
      /\bwhitespace-nowrap\b/
    );
    expect(cls, 'an inline span can still fragment; make the box atomic').toMatch(
      /\binline-block\b/
    );
  });

  /**
   * The amount is the number the client is checking. A long label must push
   * the row taller rather than squeeze the figure, so the value never wraps
   * or truncates.
   */
  it('never lets a long label squeeze the amount', async () => {
    const src = await read();
    const at = src.indexOf('{money(line.amountCents)}');
    expect(at).toBeGreaterThan(-1);
    const dd = src.slice(src.lastIndexOf('<dd', at), at);

    expect(dd, 'the amount can be compressed by a long label').toMatch(/\bshrink-0\b/);
    expect(dd, 'figures in a column should line up').toMatch(/\btabular-nums\b/);
  });

  /**
   * The label side has to be allowed to shrink for that to work — a flex item
   * defaults to `min-width: auto`, which refuses to go below its content and
   * is what pushes the amount out of the row in the first place.
   */
  it('lets the label side shrink so the row can reflow at all', async () => {
    const src = await read();
    const at = src.indexOf('already settled or invoiced');
    const dt = src.slice(src.lastIndexOf('<dt', at), at);

    expect(dt).toMatch(/\bmin-w-0\b/);
  });
});

describe('declining a change order', () => {
  /**
   * Deliberately checked on this page rather than folded into the portal
   * tap-target test: the same 20px shortfall keeps reappearing on whichever
   * control is a bare text button, and the pattern is only visible if each
   * place it has bitten says so where the code is.
   */
  it('gives the decline control a real target', async () => {
    const cls = classBefore(await read(), "This isn&apos;t right — decline it");

    expect(cls, 'the decline control has no vertical padding — it measured 20px').toMatch(
      /\bpy-1\b/
    );
  });

  /**
   * And it stays a button. If declining ever became a link or a menu item the
   * assertion above would still pass while pointing at the wrong element.
   */
  it('is still a button, not a link', async () => {
    const src = await read();
    const at = src.indexOf("This isn&apos;t right — decline it");
    const tag = src.slice(src.lastIndexOf('<', src.lastIndexOf('className=', at)), at);

    expect(tag.startsWith('<button')).toBe(true);
  });
});
