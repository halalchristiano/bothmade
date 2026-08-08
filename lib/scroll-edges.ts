/**
 * Where a scrolling box currently sits: at the top, at the bottom, or in the
 * middle with content hidden either way.
 *
 * Split out from the component because it is the part worth testing and the
 * part that has an off-by-one in it. jsdom has no layout engine, so a test can
 * assert this and nothing about the element it drives.
 */

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export type ScrollEdges = {
  /** Nothing is hidden above — don't draw a top fade. */
  atTop: boolean;
  /** Nothing is hidden below — don't draw a bottom fade. */
  atBottom: boolean;
  /** Everything fits; there is no scrolling to hint at in either direction. */
  fits: boolean;
};

/**
 * A pixel of slack at each end.
 *
 * `scrollHeight` and `clientHeight` are integers but `scrollTop` is
 * fractional on a zoomed page or a HiDPI trackpad, so scrolling fully to the
 * bottom routinely lands on 476.5 against a target of 477. Compared exactly,
 * the fade never quite goes away at the bottom of the list — which is the one
 * place it must, because a permanently half-faded final item reads as a
 * rendering fault rather than an affordance.
 */
export const EDGE_SLACK = 1;

export function scrollEdges({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): ScrollEdges {
  // A box that isn't overflowing is at both ends at once, and saying so is
  // what keeps the caller from drawing either fade on a short nav.
  const fits = scrollHeight - clientHeight <= EDGE_SLACK;
  if (fits) return { atTop: true, atBottom: true, fits: true };

  return {
    atTop: scrollTop <= EDGE_SLACK,
    atBottom: scrollTop + clientHeight >= scrollHeight - EDGE_SLACK,
    fits: false,
  };
}
