/**
 * Copy some text, and be honest about whether it worked.
 *
 * `navigator.clipboard.writeText` was being called bare in half a dozen
 * places, which gets two things wrong at once.
 *
 * It says nothing. A button labelled "Copy pay link" that does not change
 * when pressed is a button nobody trusts, so the honest response is to press
 * it again — and then to paste somewhere and check. On a page whose job is
 * getting a payment link in front of a client, "did that work?" is the last
 * question anybody should have to ask.
 *
 * And it can throw. The Clipboard API exists only in a secure context, so
 * `navigator.clipboard` is undefined on plain http — a LAN address, a preview
 * host without TLS, an older embedded webview. `undefined.writeText(...)`
 * throws synchronously inside an onClick with no catch anywhere above it, and
 * the failure surfaces as an unhandled rejection in a console nobody has
 * open, while the button sits there looking exactly as it does on success.
 *
 * The fallback is the old execCommand path. It is deprecated and it still
 * works everywhere the modern one does not, which is the whole point of a
 * fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused, or a browser that exposes the API and then
      // declines to use it. Fall through rather than give up.
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Off-screen rather than hidden: a display:none element cannot be
    // selected, and selecting it is the entire mechanism here.
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.setAttribute('readonly', '');
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
