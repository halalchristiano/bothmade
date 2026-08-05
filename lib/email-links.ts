/**
 * Links in an email that have to survive a phone.
 *
 * A `drive.google.com` address is a Google *universal link*. On iOS the mail
 * app does not hand it to a browser — it hands it to the Drive app, and if
 * that app can't resolve the target for whichever account it is signed into
 * (a shared-drive folder, most reliably) the tap does nothing at all. No
 * error, no navigation. The button looks perfect and behaves like a picture
 * of a button.
 *
 * That is the observed difference between the two buttons in this product:
 * the sign-and-pay link points at bothmade.studio and works on a phone, and
 * the mockups link pointed at drive.google.com and didn't — same markup, same
 * shell, same message. Sharing was never the problem; the hand-off was.
 *
 * So a Drive link is sent as a link to us, and we redirect. A tap goes to our
 * own domain, which no app claims, and the redirect that follows is not a
 * user-initiated navigation — so it lands in the browser, where Drive works.
 *
 * Only Drive is rewritten. Everything else already works, and an extra hop
 * it doesn't need is an extra thing to go wrong.
 */

import { normalizeUrl } from '@/lib/html';
import { resolveSiteUrl } from '@/lib/site-url';

export type DriveKind = 'file' | 'folder';

export interface DriveTarget {
  kind: DriveKind;
  id: string;
}

/**
 * Drive IDs are URL-safe base64. Pinning the shape here is what stops this
 * from being an open redirect: the only thing the route can ever be talked
 * into pointing at is a Drive URL it assembles itself.
 */
export const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

/** The Drive file or folder a URL refers to, or null if it isn't one. */
export function parseDriveTarget(value: unknown): DriveTarget | null {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  if (!/^(.+\.)?drive\.google\.com$/i.test(url.hostname)) return null;

  const folder = /^\/drive(?:\/u\/\d+)?\/folders\/([^/?#]+)/.exec(url.pathname);
  if (folder && DRIVE_ID_PATTERN.test(folder[1])) return { kind: 'folder', id: folder[1] };

  const file = /^\/file\/d\/([^/?#]+)/.exec(url.pathname);
  if (file && DRIVE_ID_PATTERN.test(file[1])) return { kind: 'file', id: file[1] };

  // The older query forms. `/thumbnail` is deliberately not among them — that
  // one is an <img src>, not somewhere a tap goes, and sending image bytes
  // through a redirect helps nobody.
  if (/^\/(open|uc|folderview)$/.test(url.pathname)) {
    const id = url.searchParams.get('id');
    if (id && DRIVE_ID_PATTERN.test(id)) {
      return { kind: url.pathname === '/folderview' ? 'folder' : 'file', id };
    }
  }

  return null;
}

/** Where a wrapped link finally lands. Assembled here, never taken from input. */
export function driveDestination(kind: string, id: string): string | null {
  if (!DRIVE_ID_PATTERN.test(id)) return null;
  if (kind === 'folder') return `https://drive.google.com/drive/folders/${id}`;
  if (kind === 'file') return `https://drive.google.com/file/d/${id}/view`;
  return null;
}

/** Our own address for a Drive target. */
export function driveLinkUrl(target: DriveTarget): string {
  return `${resolveSiteUrl()}/l/drive/${target.kind}/${target.id}`;
}

/**
 * The address to actually put in an email: routed through us when it's a
 * Drive link, normalized and otherwise untouched when it isn't. Null when
 * there's no usable link at all, so callers keep failing the same way.
 */
export function emailLinkUrl(value: unknown): string | null {
  const target = parseDriveTarget(value);
  if (target) return driveLinkUrl(target);
  return normalizeUrl(value);
}
