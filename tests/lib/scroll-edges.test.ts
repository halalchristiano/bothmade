import { describe, expect, it } from 'vitest';
import { EDGE_SLACK, scrollEdges } from '@/lib/scroll-edges';

/**
 * When the admin sidebar admits there is more of it below.
 *
 * The nav wants 772px. Measured on the real page it gets 651 at 1920×900, 551
 * at 1280×800 and 451 at 1440×700 — a laptop with a toolbar and a dock.
 *
 * At the smallest of those, seven items are below the fold — Priorities,
 * Clients, Projects, Analytics, Team Chat, Team and **Settings** — and
 * Priorities is sliced through its middle by the footer's top border, which
 * reads as the rule that ends a list rather than the edge of a scroll. The
 * scrollbar that would have said otherwise is 10% white by deliberate choice
 * ("a scrollbar is furniture, not a feature"), which on `#070510` is nothing
 * at all.
 *
 * A fade at the live edge is the fix. These are the numbers that decide where
 * to draw one — and, as much, where not to: a fade that never goes away at the
 * bottom leaves the last item permanently half-dimmed, which reads as a
 * rendering fault rather than an invitation to scroll.
 */

/** The three real measurements, so the test is about this sidebar. */
const LIST = 772;
const VIEWPORTS = { '1920x900': 651, '1280x800': 551, '1440x700': 451 };

describe('a nav taller than the sidebar', () => {
  it('hints downward, not upward, before anything is scrolled', () => {
    for (const [name, clientHeight] of Object.entries(VIEWPORTS)) {
      const edges = scrollEdges({ scrollTop: 0, scrollHeight: LIST, clientHeight });

      expect(edges.fits, name).toBe(false);
      expect(edges.atTop, name).toBe(true);
      expect(edges.atBottom, name).toBe(false);
    }
  });

  it('hints both ways in the middle', () => {
    const edges = scrollEdges({ scrollTop: 100, scrollHeight: LIST, clientHeight: 451 });

    expect(edges.atTop).toBe(false);
    expect(edges.atBottom).toBe(false);
  });

  /**
   * The one that matters most. Scrolled to the end, the bottom fade must be
   * gone — Settings is the last item in the list and the whole point of the
   * scroll was to read it.
   */
  it('stops hinting downward once the end is reached', () => {
    const edges = scrollEdges({ scrollTop: LIST - 451, scrollHeight: LIST, clientHeight: 451 });

    expect(edges.atBottom).toBe(true);
    expect(edges.atTop).toBe(false);
  });
});

describe('a nav that fits', () => {
  /**
   * On a tall window nothing is hidden, and drawing a fade there would dim
   * the list for no reason. `fits` reports both ends at once so the caller
   * draws neither without having to compare heights itself.
   */
  it('hints in neither direction', () => {
    const edges = scrollEdges({ scrollTop: 0, scrollHeight: LIST, clientHeight: LIST });

    expect(edges.fits).toBe(true);
    expect(edges.atTop).toBe(true);
    expect(edges.atBottom).toBe(true);
  });

  it('says the same when the box is taller than its content', () => {
    expect(scrollEdges({ scrollTop: 0, scrollHeight: 400, clientHeight: 900 }).fits).toBe(true);
  });
});

describe('the fractional pixel at the bottom of a scroll', () => {
  /**
   * `scrollTop` is fractional on a zoomed page or a HiDPI trackpad while the
   * two heights are integers, so scrolling fully to the bottom lands on
   * 320.5 against a target of 321. Compared exactly, `atBottom` never becomes
   * true and the final item stays half-faded forever — the exact failure the
   * conditional fade exists to avoid.
   */
  it('counts a half-pixel short of the bottom as the bottom', () => {
    const edges = scrollEdges({ scrollTop: 320.5, scrollHeight: 772, clientHeight: 451 });

    expect(edges.atBottom).toBe(true);
  });

  it('counts a half-pixel down from the top as the top', () => {
    expect(scrollEdges({ scrollTop: 0.5, scrollHeight: 772, clientHeight: 451 }).atTop).toBe(true);
  });

  /** Exactly on the tolerance still counts as the top — the boundary itself. */
  it('counts a whole pixel down from the top as the top', () => {
    expect(scrollEdges({ scrollTop: 1, scrollHeight: 772, clientHeight: 451 }).atTop).toBe(true);
    expect(EDGE_SLACK).toBe(1);
  });

  /**
   * And the slack is slack, not a free pass: a genuinely scrolled list still
   * gets its top fade.
   *
   * The number here is deliberately absolute rather than `EDGE_SLACK + 1`.
   * Written in terms of the constant it moved with it, so widening the
   * tolerance to 40px — enough to swallow a whole nav row and drop the top
   * fade on a visibly scrolled list — passed every test in this file.
   */
  it('does not swallow a real scroll', () => {
    const edges = scrollEdges({ scrollTop: 8, scrollHeight: 772, clientHeight: 451 });

    expect(edges.atTop).toBe(false);
  });

  it('still reports an overflow of a single pixel as fitting', () => {
    // One pixel of overflow is a rounding artefact, not a hidden nav item,
    // and fading for it would put a permanent smudge on a nav that fits.
    expect(scrollEdges({ scrollTop: 0, scrollHeight: 772, clientHeight: 771 }).fits).toBe(true);
  });
});
