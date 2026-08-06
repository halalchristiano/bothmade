'use client';

import { useEffect, useRef } from 'react';

/**
 * The admin's background polling, with the two brakes it was missing.
 *
 * The notification bell and the unread-chat badge refresh themselves every
 * twenty or thirty seconds so somebody sitting on one page all morning still
 * sees them move. That is right. What was wrong is what those loops did when
 * nobody was there.
 *
 * **They never stopped when the session died.** A tab left open overnight
 * keeps polling on the same timer, and every request comes back 401 from the
 * proxy. The results were being swallowed (`res.ok ? … : null`), so nothing on
 * screen changed and nothing ever gave up — about eight and a half thousand
 * 401s a day, per abandoned tab, for as long as the browser stayed open.
 * Measured, not guessed: a logged-in tab makes six calls a minute, and after
 * clearing its cookie it made exactly the same six, all 401, indefinitely.
 * That is what a 47% error rate on a site with forty visitors a week is.
 *
 * **They ran in background tabs.** A tab nobody is looking at does not need a
 * twenty-second refresh; whatever it draws is re-read the moment it comes
 * back into view.
 *
 * So: stop for good on a 401 — the session is gone, every later request is
 * the same 401, and the page is not usable anyway — and idle while hidden,
 * catching up on the way back.
 */
export function useAdminPoll(
  url: string,
  everyMs: number,
  onData: (data: unknown) => void,
  { enabled = true, onUnauthorized }: { enabled?: boolean; onUnauthorized?: () => void } = {}
) {
  // Held in refs so a caller passing an inline arrow — which every caller
  // does — cannot restart the timer on each render.
  const handler = useRef(onData);
  handler.current = onData;
  const expired = useRef(onUnauthorized);
  expired.current = onUnauthorized;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const stop = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    };

    const load = async () => {
      if (stopped) return;
      try {
        const res = await fetch(url);
        if (res.status === 401 || res.status === 403) {
          // Not a blip to retry through. The cookie is gone or no longer
          // valid, so every future request on this timer is the identical
          // 401 — and the screen behind it cannot do anything either.
          stop();
          expired.current?.();
          return;
        }
        if (!res.ok) return;
        handler.current(await res.json());
      } catch {
        // A dropped connection is worth retrying — that is what the next
        // tick is for. Only an unauthorized answer is final.
      }
    };

    const start = () => {
      if (stopped || timer) return;
      timer = setInterval(load, everyMs);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer);
        timer = null;
        return;
      }
      // Coming back into view: refresh immediately rather than waiting out
      // the rest of an interval that elapsed while nobody could see it.
      load();
      start();
    };

    if (!document.hidden) {
      load();
      start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [url, everyMs, enabled]);
}
