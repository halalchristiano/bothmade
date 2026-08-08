/**
 * What counts as a usable deliverable link.
 *
 * "Add Link" took any non-empty string as a URL, so a name typed into the
 * wrong box, or a path pasted without its scheme, became a permanent entry
 * that renders as a link and does nothing when clicked. That is bad on the
 * studio's side and worse on the client's: their dashboard has no Delete, so
 * a dead file sits in their deliverables looking like something they were
 * given and cannot open, and the obvious conclusion is that we sent them
 * something broken.
 *
 * Two jobs, and both are needed. Validating on the way in stops new ones.
 * Reading defensively on the way out is what deals with the entries already
 * stored — because they exist, and a fix that only guards the door leaves
 * them exactly as they are.
 */

/** Schemes a browser can actually open from a link in our dashboard. */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Returns the URL to link to, or null if there isn't a usable one.
 *
 * `javascript:` and `data:` are refused rather than merely unrecognised: a
 * deliverable URL is typed by a person and rendered as an anchor on two
 * dashboards, one of which a client is logged into.
 */
/**
 * Endings that mean "this is a file", not "this is a website". None of them
 * is a real TLD, so nothing that is genuinely a bare hostname is caught.
 */
const FILE_EXTENSIONS = new Set([
  'zip', 'rar', '7z', 'tar', 'gz',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'tiff',
  'psd', 'ai', 'eps', 'indd', 'sketch', 'fig', 'xd',
  'mp4', 'mov', 'avi', 'mp3', 'wav',
  'json', 'xml', 'sql', 'env', 'key', 'pem',
]);

export function deliverableHref(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    // Not absolute. A bare "example.com/file.pdf" is a real thing people
    // paste and a browser would treat as a relative path into our own app,
    // so it is worth rescuing rather than rejecting — but only when it looks
    // like a host rather than like a sentence somebody typed.
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(trimmed) && !/\s/.test(trimmed)) {
      /*
       * …but a filename is not a host, and it looks exactly like one.
       *
       * "Source.zip" passes the test above — a label, a dot, a label, end of
       * string — so pasting the FILE name into the URL box produced
       * `https://source.zip`, saved without complaint, and put a link on the
       * client's own handover page that opens nothing. The box above it is
       * literally asking for a file name, so this is the likeliest paste
       * there is, and the one nobody notices until a client tries it.
       *
       * Only the bare form is caught. Anything with a path is a URL somebody
       * meant — `example.com/brief.pdf` still rescues, which is the case this
       * rescue was written for.
       */
      const bare = !trimmed.includes('/');
      const ext = trimmed.slice(trimmed.lastIndexOf('.') + 1).toLowerCase();
      if (bare && FILE_EXTENSIONS.has(ext)) return null;
      return `https://${trimmed}`;
    }
    return null;
  }
}

/** True when this deliverable can actually be opened. */
export function isOpenable(file: { url?: unknown }): boolean {
  return deliverableHref(file?.url) !== null;
}

export type DeliverableCheck = { ok: true; url: string; name: string } | { ok: false; error: string };

/** Reads a deliverable off the wire, or says why it isn't one. */
export function readDeliverable(input: { name?: unknown; url?: unknown }): DeliverableCheck {
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 200) : '';
  if (!name) {
    return { ok: false, error: 'Give the file a name — it is what the client sees.' };
  }

  const url = deliverableHref(input.url);
  if (!url) {
    return {
      ok: false,
      error:
        typeof input.url === 'string' && input.url.trim()
          ? `"${input.url.trim().slice(0, 60)}" isn't a link the client could open. It needs to start with https://`
          : 'Add the link the file lives at.',
    };
  }

  return { ok: true, name, url };
}
