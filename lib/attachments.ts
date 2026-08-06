/**
 * Attachments, as links rather than files.
 *
 * Every chat surface here used to hang a file picker off a paperclip: pick a
 * file, wait for it to go up to Blob storage, then send. It failed often
 * enough to be the thing people noticed — a client thread that sat on
 * "Uploading…" and never came back, which is worse than no attachment at all
 * because the message never sends either, and whoever typed it walks away
 * believing it did.
 *
 * The work being shared is already somewhere. A design is in Figma, a
 * contract is a Google Doc, a walkthrough is a Loom, the assets are in a
 * Drive folder. Copying those bytes into our own bucket so we can hand back a
 * URL was never buying anything except a second copy that goes stale — the
 * document keeps being edited where it lives, and the attachment does not.
 *
 * So an attachment is a link with a name. Same stored shape as before —
 * `{ name, url }` on both message tables — so nothing needs migrating and
 * every file already shared stays exactly where it is and keeps rendering.
 * What changes is where new ones come from, and how much this file can say
 * about them: a Google Doc knows it is a document, and a link that announces
 * itself as one is the difference between a URL in a message and something
 * that looks like it was attached on purpose.
 */

export interface Attachment {
  name: string;
  url: string;
}

/** What the link is, as far as its address gives it away. */
export type AttachmentKind =
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'pdf'
  | 'folder'
  | 'design'
  | 'video'
  | 'image'
  | 'code'
  | 'archive'
  | 'link';

export interface AttachmentMeta {
  kind: AttachmentKind;
  /** What to call this sort of thing on the card: "Google Doc", "Figma file". */
  typeLabel: string;
  /** The domain, for the second line — a link you can place before you open it. */
  host: string;
}

const DOC_EXT = /\.(docx?|odt|rtf|pages|txt|md)(\?|#|$)/i;
const SHEET_EXT = /\.(xlsx?|csv|ods|numbers)(\?|#|$)/i;
const SLIDES_EXT = /\.(pptx?|odp|key)(\?|#|$)/i;
const PDF_EXT = /\.pdf(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|heic)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi)(\?|#|$)/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz)(\?|#|$)/i;
const CODE_EXT = /\.(json|xml|ya?ml|sql|zipx?|ts|tsx|js|css|html?)(\?|#|$)/i;

/**
 * Known hosts, read before file extensions.
 *
 * A Google Doc's URL has no `.docx` on the end of it, and it is by some
 * distance the most common thing anybody attaches here. Recognising the host
 * is what lets the card say "Google Doc" instead of "docs.google.com".
 */
const HOSTS: Array<{ test: RegExp; kind: AttachmentKind; label: string }> = [
  { test: /docs\.google\.com\/document/i, kind: 'doc', label: 'Google Doc' },
  { test: /docs\.google\.com\/spreadsheets/i, kind: 'sheet', label: 'Google Sheet' },
  { test: /docs\.google\.com\/presentation/i, kind: 'slides', label: 'Google Slides' },
  { test: /docs\.google\.com\/forms/i, kind: 'doc', label: 'Google Form' },
  { test: /drive\.google\.com\/drive\/folders/i, kind: 'folder', label: 'Drive folder' },
  { test: /drive\.google\.com/i, kind: 'doc', label: 'Drive file' },
  { test: /dropbox\.com/i, kind: 'folder', label: 'Dropbox' },
  { test: /(1drv\.ms|sharepoint\.com|onedrive\.live\.com)/i, kind: 'folder', label: 'OneDrive' },
  { test: /(figma\.com|framer\.com)/i, kind: 'design', label: 'Figma file' },
  { test: /(loom\.com|youtube\.com|youtu\.be|vimeo\.com)/i, kind: 'video', label: 'Video' },
  { test: /notion\.(so|site)/i, kind: 'doc', label: 'Notion page' },
  { test: /(github\.com|gitlab\.com)/i, kind: 'code', label: 'Repository' },
  { test: /canva\.com/i, kind: 'design', label: 'Canva design' },
  { test: /calendly\.com/i, kind: 'link', label: 'Booking link' },
];

const EXTENSIONS: Array<{ test: RegExp; kind: AttachmentKind; label: string }> = [
  { test: PDF_EXT, kind: 'pdf', label: 'PDF' },
  { test: DOC_EXT, kind: 'doc', label: 'Document' },
  { test: SHEET_EXT, kind: 'sheet', label: 'Spreadsheet' },
  { test: SLIDES_EXT, kind: 'slides', label: 'Slides' },
  { test: IMAGE_EXT, kind: 'image', label: 'Image' },
  { test: VIDEO_EXT, kind: 'video', label: 'Video' },
  { test: ARCHIVE_EXT, kind: 'archive', label: 'Archive' },
  { test: CODE_EXT, kind: 'code', label: 'File' },
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function describeAttachment(a: Attachment): AttachmentMeta {
  const url = a.url ?? '';
  const host = hostOf(url);

  const byHost = HOSTS.find((h) => h.test.test(url));
  if (byHost) return { kind: byHost.kind, typeLabel: byHost.label, host };

  // Tested against the URL and the name separately, not the two joined: every
  // pattern here is anchored to the end of what it is matching, so gluing a
  // name onto the address stops `contract.pdf` looking like a PDF at all.
  //
  // The name is worth reading in its own right — a Blob URL carries a random
  // suffix, so a file uploaded last month is only recognisable by what it was
  // called.
  const byExt = EXTENSIONS.find((e) => e.test.test(url) || e.test.test(a.name ?? ''));
  if (byExt) return { kind: byExt.kind, typeLabel: byExt.label, host };

  return { kind: 'link', typeLabel: 'Link', host };
}

/**
 * A link typed by a person, or null when it is not one.
 *
 * A bare `figma.com/file/…` pasted out of an address bar is the ordinary
 * case and gets its scheme put back. Anything that is not http(s) after that
 * is refused rather than rendered: these become an `href` somebody clicks, so
 * a `javascript:` string must never survive this function.
 */
export function normalizeAttachmentUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(trimmed)
      ? `https://${trimmed}`
      : '';
  if (!withScheme) return null;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * A name for a link nobody bothered to name.
 *
 * The last meaningful path segment, tidied — "Q3-brand-guidelines.pdf" out of
 * a long Drive URL. Falls back to the host, which is at least true. An
 * unnamed attachment renders as its own URL otherwise, which is the thing
 * this whole file exists to stop looking like.
 */
export function suggestAttachmentName(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Google's URLs end in /edit or /view, and the id before it is noise.
    const meaningful = segments
      .filter((s) => !/^(edit|view|preview|d|file|document|folders|drive)$/i.test(s))
      .filter((s) => !/^[A-Za-z0-9_-]{20,}$/.test(s));
    const last = meaningful[meaningful.length - 1];
    if (last) {
      return decodeURIComponent(last).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    }
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 120);
  }
}

/**
 * Read an attachment list off anything — a JSON string on the legacy column,
 * a native JSON array on the newer one, or something malformed.
 *
 * Project messages store `attachments` as a JSON-encoded string defaulting to
 * `""`; team messages store native JSON defaulting to `[]`. Both arrive here
 * and leave as the same array, so nothing downstream has to know which table
 * it came from.
 */
export function readAttachments(raw: unknown): Attachment[] {
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (a): a is { name: unknown; url: unknown } =>
        typeof a === 'object' && a !== null && 'name' in a && 'url' in a
    )
    .map((a) => ({ name: String(a.name).slice(0, 200), url: String(a.url) }))
    .filter((a) => /^https?:\/\//i.test(a.url))
    .map((a) => ({ name: a.name.trim() || suggestAttachmentName(a.url), url: a.url }))
    .slice(0, MAX_ATTACHMENTS);
}

export const MAX_ATTACHMENTS = 10;
