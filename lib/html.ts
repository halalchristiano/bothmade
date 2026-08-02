/**
 * HTML escaping for values interpolated into email bodies.
 *
 * Every transactional email in this codebase is built by string
 * concatenation, which is fine right up until one of the interpolated
 * values came from a person. A client whose company name contains a stray
 * `<` breaks the layout; a message body containing a tag rewrites it. The
 * fix is not to stop concatenating, it's to escape at the seam.
 *
 * Escape anything a human typed. Do not escape markup you wrote yourself —
 * that's what the `Html` naming on the parameters is signalling.
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes, then turns newlines into `<br>` — for multi-line prose (a chat
 * message, a note) that should keep its shape in an email. Escaping happens
 * first, so the only tags in the result are the ones added here.
 */
export function escapeHtmlMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

/**
 * Truncates on a word boundary, for previews. Applied before escaping so
 * the limit counts characters a human sees, not entity expansions.
 */
export function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
