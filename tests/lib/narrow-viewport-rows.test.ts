import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * Two rows on the client's own portal that could not fit a 320px phone.
 *
 * 320px is an iPhone SE, not a hypothetical. Neither row scrolls the document
 * horizontally, so what does not fit is not merely awkward — it is cut off the
 * right edge and cannot be reached at all.
 *
 *   The header buttons were `shrink-0 flex gap-2`. Three buttons told never to
 *   shrink keep their content width whatever the viewport: they measured 475px
 *   inside 320, and "Copy status summary" was simply gone. The header around
 *   them already wrapped; this row was the one thing in it that would not.
 *
 *   The tab bar was `w-fit` with no overflow rule. Four pills and their badges
 *   need about 418px, so Onboarding — the tab that says "3 still to answer" —
 *   was off the edge. A pill bar cannot wrap without looking broken, so it
 *   scrolls on its own axis; `max-w-full` is what permits it to be narrower
 *   than its content, which `w-fit` alone forbids.
 *
 * jsdom has no layout engine and cannot see any of this. What it can hold is
 * the class contract that produced the measurements, which were taken in a
 * real browser at 320px: 475px → on screen, and Onboarding reachable.
 */

const PAGE = 'app/client/[projectId]/page.tsx';

const source = async () => readFile(PAGE, 'utf8');

/**
 * The className of the element a marker sits inside.
 *
 * `dir` matters and got this wrong first time round: `handleCopyShareLink`
 * also appears where it is declared, hundreds of lines above its use, and the
 * tablist writes its aria-label before its className. So the caller says which
 * way to look rather than the helper guessing.
 */
const classOf = (src: string, marker: string, dir: 'before' | 'after'): string => {
  const at = dir === 'before' ? src.lastIndexOf(marker) : src.indexOf(marker);
  expect(at, `could not find ${marker} in ${PAGE}`).toBeGreaterThan(-1);
  const key = 'className="';
  const open = dir === 'before' ? src.lastIndexOf(key, at) : src.indexOf(key, at);
  expect(open, `no className near ${marker}`).toBeGreaterThan(-1);
  return src.slice(open + key.length, src.indexOf('"', open + key.length));
};

describe('the client portal at 320px', () => {
  it('lets the header buttons wrap instead of holding their width', async () => {
    const src = await source();
    // The JSX use, not the declaration far above it.
    const cls = classOf(src, 'onClick={handleCopyShareLink}', 'before');

    expect(cls, 'the button row still refuses to shrink').not.toMatch(/\bshrink-0\b/);
    expect(cls, 'the button row cannot wrap').toMatch(/\bflex-wrap\b/);
  });

  it('lets the tab bar scroll rather than clip its last tab', async () => {
    const src = await source();
    const cls = classOf(src, 'aria-label="Project sections"', 'after');

    // w-fit is fine and wanted — it keeps the pill bar hugging its tabs on a
    // desk. What it must not do is forbid being narrower than its contents.
    expect(cls, 'the tab bar cannot be narrower than its tabs').toMatch(/\bmax-w-full\b/);
    expect(cls, 'the overflow has nowhere to go').toMatch(/\boverflow-x-auto\b/);
  });
});
