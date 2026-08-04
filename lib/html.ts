/**
 * Escaping helpers for the transactional-email templates.
 *
 * Every email in this app is assembled by string-concatenating values into
 * HTML. Most of those values are typed by a person — a company name, a
 * contact name, a message preview a client wrote, a headline a rep chose —
 * and none of them were escaped. A lead named `</p><script>…` or a client
 * message containing an `<img onerror>` went straight into an email body,
 * and from there into whichever webmail client renders it.
 *
 * `esc()` is for text. `escAttr()` is for a value going inside an HTML
 * attribute. `safeUrl()` is for anything landing in an href, because
 * escaping alone doesn't stop `javascript:`.
 */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for use as HTML text content. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

/**
 * Alias kept for the call sites that landed on main while this work was in
 * flight. Same function; `esc` is the name used everywhere else here, and
 * this one takes `string` because that is what those callers pass.
 */
export function escapeHtml(value: string): string {
  return esc(value);
}

/** Escape a value for use inside a double-quoted HTML attribute. */
export function escAttr(value: unknown): string {
  return esc(value);
}

/**
 * Escape text and turn its line breaks into markup — for anything a human
 * typed into a textarea that should keep its shape in the email.
 */
export function escMultiline(value: unknown): string {
  return esc(value).replace(/\r\n|\r|\n/g, '<br/>');
}

/**
 * Same, but paragraph-aware: blank lines become separate <p> blocks, single
 * newlines become <br/>. Matches how the composer's message box reads.
 */
export function escParagraphs(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return text
    .split(/\n\s*\n/)
    .filter((block) => block.trim().length > 0)
    .map((block) => `<p>${escMultiline(block)}</p>`)
    .join('');
}

const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

// Something already carrying its own scheme — `https:`, `mailto:`, and also
// the ones we're about to reject, which have to be recognised as schemes so
// they're rejected rather than quietly prefixed into `https://javascript:...`.
const HAS_SCHEME = /^[a-z][a-z0-9+.\-]*:/i;

// What a host looks like when someone pastes a link without the scheme —
// `bothmade.studio/mockups`, `drive.google.com/file/d/…`, `www.loom.com/…`.
// Requires a dot and a real-looking TLD, so ordinary prose typed into a URL
// box ("ask me for it") still fails rather than becoming https://ask me…
const BARE_HOST = /^[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i;

/**
 * The canonical, unescaped form of a link, or null if it isn't one we're
 * willing to point a client at.
 *
 * Copying a URL out of a browser gets you the scheme; typing one from memory
 * or copying it out of a document often doesn't. Without this, a button whose
 * link was pasted as `bothmade.studio/mockups` failed `new URL()`, came back
 * null, and the template silently rendered no button at all — the failure
 * looked like a missing feature rather than a missing `https://`.
 *
 * Rejects `javascript:`, `data:`, `vbscript:` and anything else that isn't
 * plainly a link: a rep pasting an attacker's "Loom link" into a template
 * shouldn't be able to ship script into a client's inbox.
 */
export function normalizeUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const candidate = HAS_SCHEME.test(raw) ? raw : BARE_HOST.test(raw) ? `https://${raw}` : raw;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) return null;
  // `https://` on its own parses fine and links nowhere.
  if (parsed.protocol !== 'mailto:' && !parsed.hostname) return null;

  return parsed.toString();
}

/** Returns the URL escaped for an href, or null when it isn't one. */
export function safeUrl(value: unknown): string | null {
  const normalized = normalizeUrl(value);
  return normalized === null ? null : escAttr(normalized);
}

// A link that only resolves on the machine that composed the email. Pasting
// one into a client's inbox produces a button that looks perfect and does
// nothing, which is the exact failure this whole check exists to catch.
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|.*\.local)$/i;

/**
 * Why a link won't work, in words someone composing an email can act on, or
 * null when it's fine. Shown next to the field rather than discovered by the
 * recipient — safe to call from the browser, this module has no server deps.
 */
export function describeUrlProblem(value: unknown): string | null {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (!raw) return null;

  const normalized = normalizeUrl(raw);
  if (!normalized) {
    return "That isn't a link we can put behind a button — it needs to look like https://example.com/page.";
  }

  const parsed = new URL(normalized);
  if (parsed.protocol !== 'mailto:' && LOCAL_HOSTS.test(parsed.hostname)) {
    return 'That link only works on this computer — the recipient would get a button that goes nowhere.';
  }
  return null;
}

/**
 * Strips CR/LF (and the encoded forms of them) out of a value destined for
 * an email header. A newline in a To: or From: value ends the header and
 * starts a new one — that's how a "send to this address" field becomes a
 * "Bcc: everyone" field. Also drops the surrounding whitespace and any
 * NUL bytes, which some MTAs treat as terminators too.
 */
export function sanitizeHeaderValue(value: string): string {
  return value
    .replace(/%0[ad]/gi, '')
    // CR, LF, NUL, and the Unicode line/paragraph separators.
    .replace(/[\r\n\u0000\u2028\u2029]/g, '')
    .trim();
}

// Deliberately strict: an address with a comma or a semicolon in it is
// either a list smuggled into a single-recipient field or a malformed
// address, and neither should be sent.
const EMAIL_ADDRESS_PATTERN = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/**
 * Header-safe email address, or null if it isn't one. Use on every value
 * that reaches a to/from/reply-to field.
 */
export function sanitizeEmailAddress(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = sanitizeHeaderValue(String(value));
  if (!cleaned || cleaned.length > 254) return null;
  return EMAIL_ADDRESS_PATTERN.test(cleaned) ? cleaned : null;
}

/** Same, for a list of recipients. Drops anything that doesn't pass. */
export function sanitizeEmailAddresses(values: string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const address = sanitizeEmailAddress(value);
    if (address) seen.add(address);
  }
  return Array.from(seen);
}

/**
 * Header-safe display name — the part before `<address>`. Quotes and angle
 * brackets are dropped rather than escaped, since a stray one changes how
 * the whole From: line parses.
 */
export function sanitizeDisplayName(value: unknown): string {
  if (value === null || value === undefined) return '';
  return sanitizeHeaderValue(String(value)).replace(/["<>;,]/g, '').slice(0, 120);
}

/** Header-safe subject line — no folding, no injected headers. */
export function sanitizeSubject(value: unknown): string {
  if (value === null || value === undefined) return '';
  return sanitizeHeaderValue(String(value)).slice(0, 300);
}

/**
 * A readable text/plain rendering of one of our HTML emails, so every
 * message can go out as multipart/alternative.
 *
 * This is a deliverability fix, not a feature. An HTML-only message is a
 * scored spam signal — SpamAssassin has a rule for exactly it — because
 * real transactional senders send both parts and bulk phishing usually
 * doesn't. Ours were HTML-only on every path.
 *
 * Deliberately not a general-purpose HTML-to-text converter: it only has to
 * handle markup this repo generates. Links become "text (url)" rather than
 * being dropped, since a plaintext reader that can't see where a button
 * went is worse than no plaintext part at all.
 */
export function htmlToPlainText(html: string): string {
  return (
    String(html)
      // Nothing inside these is content.
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
      // Keep the destination of a link, not just its label.
      .replace(
        /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_match, href: string, label: string) => {
          const text = label.replace(/<[^>]+>/g, '').trim();
          const url = href.trim();
          if (!url || url.startsWith('mailto:') || text === url) return text || url;
          return `${text} (${url})`;
        }
      )
      // Block-level boundaries become line breaks before tags are stripped.
      .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\b[^>]*>/gi, '\n')
      .replace(/<\/table>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      // Entities this codebase actually emits.
      .replace(/&nbsp;/gi, ' ')
      .replace(/&(amp|lt|gt|quot|#39|apos|ldquo|rdquo|mdash|middot);/gi, (m) => {
        const map: Record<string, string> = {
          '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
          '&#39;': "'", '&apos;': "'", '&ldquo;': '"', '&rdquo;': '"',
          '&mdash;': '—', '&middot;': '·',
        };
        return map[m.toLowerCase()] ?? m;
      })
      // Tidy the whitespace the markup left behind.
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
