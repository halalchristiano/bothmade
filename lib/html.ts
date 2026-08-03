/**
 * Escape anything user-supplied before it reaches an HTML email body.
 *
 * Shared rather than redefined per route: the public forms and the internal
 * alerts they trigger all interpolate the same visitor-controlled strings,
 * and one of them missing this is an HTML injection into our own inbox.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
