import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * The site nav is `position: fixed`, and a fixed element with no horizontal
 * offset is not where people assume it is.
 *
 * `w-full` gives it the viewport's WIDTH. It does not give it the viewport's
 * left edge — with `left` unset the box sits at its static position, wherever
 * it would have landed in normal flow. On any page whose wrapper carries
 * horizontal padding that is 24px in, so a 100%-of-viewport-wide bar starting
 * at x=24 hangs 24px off the right.
 *
 * Two pages expose it: app/not-found.tsx and app/error.tsx are both
 * `<main class="... px-6 overflow-hidden">`. Measured in a browser at 390px,
 * the nav ran [24..414] and the menu button ended at 400 — ten pixels past the
 * edge, bars cut mid-stroke — and `overflow-hidden` meant nothing scrolled far
 * enough to reach it. Those are exactly the two pages where that button is the
 * only useful thing on screen: somebody who has hit a dead end or an error and
 * wants a way back into the site.
 *
 * With `left-0` the same measurement reads [0..390] and the button ends at 376.
 *
 * jsdom has no layout engine and can see none of that, so what is held here is
 * the rule that produced the measurement, plus the two layouts that made it
 * visible — because if either of those loses its padding the bug goes quiet
 * without going away.
 */

const read = (path: string) => readFile(path, 'utf8');

describe('the fixed site nav', () => {
  it('pins its own left edge rather than inheriting a static one', async () => {
    const src = await read('components/Nav.tsx');

    /*
     * The nav's OWN static class list, not its subtree.
     *
     * Reading the whole `<motion.nav>…</motion.nav>` span proves nothing:
     * there is an `absolute bottom-0 left-0` underline inside it, so a
     * `left-0` search passed with the offset deleted from the bar itself. The
     * slice stops at the first `${`, which is the end of the fixed prefix and
     * the beginning of the scrolled/unscrolled branches.
     */
    const at = src.indexOf('<motion.nav');
    expect(at, 'the nav is no longer a <motion.nav>').toBeGreaterThan(-1);
    const classes = src.slice(at, src.indexOf('${', at));

    expect(classes, 'Nav is no longer fixed — this test is about fixed positioning').toMatch(/\bfixed\b/);
    expect(
      classes,
      'a fixed bar with no `left` starts at its static position, so any padded wrapper pushes it off the right edge'
    ).toMatch(/\bleft-0\b/);
  });

  /**
   * Not decoration: these are the wrappers whose padding is what the missing
   * offset was inherited from.
   */
  it.each(['app/not-found.tsx', 'app/error.tsx'])(
    'still renders the nav inside the padded, clipped wrapper in %s',
    async (page) => {
      const src = await read(page);

      expect(src, `${page} no longer renders <Nav />`).toMatch(/<Nav\b/);
      const main = src.slice(src.indexOf('<main'), src.indexOf('>', src.indexOf('<main')));
      expect(main).toMatch(/\bpx-6\b/);
      // The half that made it unreachable rather than merely ugly.
      expect(main).toMatch(/\boverflow-hidden\b/);
    }
  );
});
