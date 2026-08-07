/**
 * Tell the server something on the way out of the page.
 *
 * THE PROBLEM THIS EXISTS FOR. Tapping a `tel:` link hands the screen to the
 * phone app, and the browser may freeze or discard the page a moment later.
 * An ordinary `fetch` is cancelled when that happens — so the request that
 * records the dial dies exactly when it matters, on the one measurement in
 * this system nobody has to remember to take.
 *
 * `navigator.sendBeacon` is the API built for this case. The browser takes
 * ownership of the request and delivers it whatever happens to the page, and
 * unlike `fetch` with `keepalive` it has been reliable on mobile Safari for
 * years — which is the browser these calls are actually made from. Cookies go
 * with it on a same-origin request, so the session still authenticates.
 *
 * `fetch` with `keepalive` is kept as the fallback for anywhere sendBeacon is
 * missing or refuses (it returns false when the queue is full). Between them
 * the request survives; a bare fetch would not.
 *
 * Deliberately fire-and-forget. There is nobody left on the page to show an
 * error to, and a failed measurement must never look like a failed call.
 */
export function beacon(url: string): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // An empty body rather than JSON: these endpoints take everything they
      // need from the URL and the session, and a Content-Type sendBeacon has
      // chosen for us is one more thing that can be wrong.
      if (navigator.sendBeacon(url)) return;
    }
  } catch {
    /* some browsers throw rather than returning false — fall through */
  }

  try {
    void fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
  } catch {
    /* a measurement that fails must never look like a call that failed */
  }
}
