/**
 * The two addresses of one unsubscribe.
 *
 * A cold email needs a way out, and there are two audiences for it that want
 * different things from the same URL:
 *
 * - **A person**, who clicks the link in the footer. They land on a page that
 *   asks once and unsubscribes on the button press. It has to be a page and
 *   it has to need a press, because every corporate mail scanner in the world
 *   fetches every link in every message to see where it goes — and a GET that
 *   unsubscribes means the scanner silently kills the lead. See
 *   app/api/public/stop/route.ts, which is where that was learned.
 *
 * - **The mail client**, which reads `List-Unsubscribe` and puts its own
 *   Unsubscribe control next to the sender's name. Since Gmail's 2024
 *   bulk-sender rules that control is expected to work in one click, which
 *   RFC 8058 defines as a POST carrying `List-Unsubscribe=One-Click`. There
 *   is nobody on a screen to press a button, so it needs an endpoint that
 *   does the work on POST alone.
 *
 * Same token, same effect, two URLs — so keeping them in step is one import
 * rather than a convention every send path has to remember.
 */
export interface UnsubscribeLinks {
  /** For the visible footer link: a page that asks, then acts on a button press. */
  pageUrl: string;
  /** For the `List-Unsubscribe` header: POST-only, one click, no screen involved. */
  oneClickUrl: string;
}

export function unsubscribeLinks(siteUrl: string, shareToken: string | null | undefined): UnsubscribeLinks | null {
  const token = shareToken?.trim();
  // No token means no way to identify who is asking to be left alone, and a
  // link that cannot work is worse than no link: it reads as an opt-out that
  // was offered and ignored.
  if (!token) return null;

  const base = siteUrl.replace(/\/+$/, '');
  const encoded = encodeURIComponent(token);
  return {
    pageUrl: `${base}/stop/${encoded}`,
    oneClickUrl: `${base}/api/public/stop/${encoded}`,
  };
}
