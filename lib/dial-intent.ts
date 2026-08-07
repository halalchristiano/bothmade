import { beacon } from '@/lib/beacon';

/**
 * Counting a dial only once the phone actually dials.
 *
 * ## The bug this exists for
 *
 * Tapping a `tel:` link does not place a call. iOS puts up its own sheet
 * first — a blue "Call 770-616-2662" and a grey "Cancel" — and nothing has
 * happened until one of those is pressed. Recording the dial from the link's
 * click handler counted the tap, so every cancel, every mis-tap and every
 * "wrong number, back out" landed in the number that exists to be
 * trustworthy. A counter that inflates itself is worse than no counter: it
 * cannot be used to hold anybody to anything, including themselves.
 *
 * ## How the two are told apart
 *
 * The sheet is drawn over the page and the page stays visible behind it, so
 * pressing Cancel changes nothing the browser can see — the document is never
 * hidden. Pressing Call opens the phone app, which pushes the browser to the
 * background, and that the browser reports: `visibilitychange` to hidden, and
 * `pagehide` alongside it.
 *
 * So: arm on the tap, fire on the handover, and if the handover never comes,
 * throw the attempt away. The page going away IS the call starting.
 *
 * ## What it costs
 *
 * A dial from a device where nothing answers `tel:` — a desktop with no
 * softphone, most likely — never backgrounds the page and so is never
 * counted. That is the honest answer: nothing was dialled. The alternative is
 * counting taps again, which is the thing being fixed.
 */

/**
 * How long the handover is allowed to take.
 *
 * The sheet is a decision somebody makes in a second or two, and the phone
 * app opens the instant they choose. Long enough to cover a slow device and a
 * moment's hesitation; short enough that switching apps for an unrelated
 * reason five minutes later cannot be mistaken for a call.
 */
export const DIAL_HANDOVER_WINDOW_MS = 20_000;

type Cleanup = () => void;

/**
 * Watches for the phone app taking over, and calls `onDialled` if it does.
 *
 * Returns a cleanup so a second tap replaces the first rather than leaving
 * two sets of listeners racing to record the same call twice.
 */
export function watchForHandover(onDialled: () => void, window_ = DIAL_HANDOVER_WINDOW_MS): Cleanup {
  if (typeof document === 'undefined') return () => {};

  let settled = false;

  const finish = (dialled: boolean) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (dialled) onDialled();
  };

  const onHidden = () => {
    // `pagehide` fires with the document still marked visible on some
    // browsers, so it is trusted on its own rather than being gated on the
    // visibility state.
    if (document.visibilityState === 'hidden') finish(true);
  };
  const onPageHide = () => finish(true);

  const timer = setTimeout(() => finish(false), window_);

  function cleanup() {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', onPageHide);
  }

  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', onPageHide);

  return () => finish(false);
}

/**
 * The whole gesture: somebody tapped a number, and we find out whether they
 * went through with it.
 *
 * `onDialled` runs only on the handover — it is where the local state that
 * says "this call happened" belongs, so a cancel leaves the screen exactly as
 * it was rather than flipping it into its after-the-call shape.
 */
export function recordDialAttempt(url: string, onDialled?: () => void): Cleanup {
  return watchForHandover(() => {
    beacon(url);
    onDialled?.();
  });
}
