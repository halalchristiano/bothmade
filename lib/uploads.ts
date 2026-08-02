/**
 * Upload policy for the direct-to-Blob endpoints.
 *
 * All three token routes previously passed `allowedContentTypes: undefined`
 * with no size cap — an authenticated caller could mint a token for any
 * file of any size and park it on our storage bill. Two things matter here:
 *
 *  - **Type.** `text/html` and `image/svg+xml` are the ones worth naming:
 *    both execute script when opened, and a blob URL under our storage
 *    domain, sent from our system, is a convincing place to host it. Neither
 *    is a deliverable or a message attachment, so neither is on any list.
 *  - **Size.** A cap that reflects what the feature is actually for. Blob
 *    storage is metered, and an unbounded token is an unbounded invoice.
 */

/** Attachments a client adds to a project message. */
export const CLIENT_ATTACHMENT_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export const CLIENT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Deliverables the team ships to a client — wider than the client list,
 * since these include design files, archives, and video, but still a list
 * rather than "anything".
 */
export const DELIVERABLE_CONTENT_TYPES = [
  ...CLIENT_ATTACHMENT_CONTENT_TYPES,
  'image/svg+xml', // a design asset here, not a page a client is told to open
  'application/postscript',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-tar',
  'application/json',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
];

export const DELIVERABLE_MAX_BYTES = 250 * 1024 * 1024; // 250 MB

/** A team member's headshot for the email footer. */
export const AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Reads the `{ projectId }` a client's upload must be scoped to. The Blob
 * client sends this verbatim from the browser, so it is a claim, not a
 * fact — the caller still has to check the session owns that project.
 */
export function readProjectIdFromPayload(clientPayload: string | null | undefined): string | null {
  if (!clientPayload) return null;
  try {
    const parsed = JSON.parse(clientPayload) as { projectId?: unknown };
    return typeof parsed.projectId === 'string' && parsed.projectId ? parsed.projectId : null;
  } catch {
    return null;
  }
}
