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

/**
 * Attachments a client used to add to a project message.
 *
 * Chat attachments are links now — nothing uploads from a message thread on
 * either side. This list stays because the deliverables policy below is built
 * on it, and a deliverable is still a real file the studio hands over.
 */
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
 * Video a mockup can arrive as — a screen recording walking the client
 * through the build, or a clip filmed on a phone.
 *
 * Its own list because "video" is not one format. The list used to be
 * `video/mp4` and `video/quicktime`, which covers a Mac screen recording and
 * an iPhone clip and nothing else: a Loom or OBS export is webm, an Android
 * capture is 3gpp, an older screen grab is avi. Every one of those was
 * refused at the token route with a message about content types, which reads
 * as "the site is broken" rather than "use a different container".
 */
export const VIDEO_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime', // .mov — iPhone clips, macOS screen recordings
  'video/webm', // Loom, OBS, anything recorded in a browser
  'video/x-m4v',
  'video/mpeg',
  'video/ogg',
  'video/3gpp', // Android capture
  'video/x-msvideo', // .avi
  'video/x-matroska', // .mkv
  'video/x-ms-wmv',
];

/**
 * Deliverables the team ships to a client — wider than the client list,
 * since these include design files, archives, and video, but still a list
 * rather than "anything".
 */
export const DELIVERABLE_CONTENT_TYPES = [
  ...CLIENT_ATTACHMENT_CONTENT_TYPES,
  ...VIDEO_CONTENT_TYPES,
  'image/svg+xml', // a design asset here, not a page a client is told to open
  'image/heif',
  'application/postscript',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-tar',
  'application/json',
  'audio/mpeg',
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
];

/**
 * 250MB was set with design exports in mind and is under what a single
 * screen recording weighs — a three-minute 1080p walkthrough lands around
 * 300MB, and phone video is heavier still. The cap exists so an
 * authenticated token can't park anything on the storage bill, not to pick
 * a maximum length for a video, so it moves up to where a real walkthrough
 * fits.
 */
export const DELIVERABLE_MAX_BYTES = 512 * 1024 * 1024; // 512 MB

/**
 * Past this, upload in parts.
 *
 * `upload()` sends the whole file as one PUT by default, so a 300MB video
 * over a phone connection is a single request with no retry and no
 * resumption: one dropped bar and the whole upload restarts from zero, which
 * is indistinguishable from the button not working. Multipart splits it,
 * uploads in parallel, and retries the parts that fail.
 */
export const MULTIPART_THRESHOLD_BYTES = 32 * 1024 * 1024; // 32 MB

/**
 * The paperwork fields on a lead — the mockup PDF, the invoice PDF.
 *
 * Deliberately narrower than DELIVERABLE_CONTENT_TYPES: these two fields
 * are handed to a client as "the invoice" or "the mockup", and a link
 * labelled that which opens a video or an SVG is either a mistake nobody
 * catches or a page dressed up as a document. One type, so the label and
 * the file cannot disagree.
 */
export const DOCUMENT_CONTENT_TYPES = ['application/pdf'];

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/** A team member's headshot for the email footer. */
export const AVATAR_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * What a browser leaves out.
 *
 * `File.type` is a guess the OS makes, and for video it is often blank —
 * a clip shared out of the iOS Photos app frequently arrives with no type
 * at all, and some pickers hand over `application/octet-stream` for
 * everything. Blob's fallback is to read the extension off the pathname,
 * which fails the same way when the picker also renames the file to
 * something extensionless. Either way the upload is refused for a reason
 * that has nothing to do with the file.
 *
 * Only the formats on a policy list are worth mapping — anything else is
 * refused regardless, so guessing at it buys nothing.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  ogv: 'video/ogg',
  '3gp': 'video/3gpp',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  wmv: 'video/x-ms-wmv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
};

/** A type the browser actually determined, as opposed to a shrug. */
function isSpecificType(type: string): boolean {
  return Boolean(type) && type !== 'application/octet-stream' && type !== 'binary/octet-stream';
}

/**
 * The content type to upload a file under: what the browser says when it
 * says anything, and otherwise what the extension implies. Null when neither
 * is any help — that file can't be checked against a policy, so it doesn't
 * get sent.
 */
export function contentTypeForFile(fileName: string, browserType: string): string | null {
  if (isSpecificType(browserType)) return browserType;
  const extension = fileName.toLowerCase().split('.').pop();
  if (!extension || extension === fileName.toLowerCase()) return null;
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? null;
}

/** "312 MB" — for telling someone how far over the cap they are. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export interface UploadPolicy {
  allowed: string[];
  maxBytes: number;
}

/**
 * Applies a policy in the browser, before a single byte goes anywhere.
 *
 * The token route is what enforces this — nothing here is a security
 * boundary. The point is *when* the answer arrives: without this, a file
 * that is over the cap or of the wrong type is uploaded in full and then
 * rejected by the Blob API, so the person watches a progress bar for six
 * minutes to be told `Vercel Blob: content type video/webm is not allowed`.
 * Refusing up front, in a sentence that names the file, is the difference
 * between a rule and a malfunction.
 */
export function checkUpload(
  file: { name: string; type: string; size: number },
  policy: UploadPolicy
): { contentType: string } | { error: string } {
  if (file.size > policy.maxBytes) {
    return {
      error: `That file is ${formatFileSize(file.size)} — the limit is ${formatFileSize(
        policy.maxBytes
      )}. Upload it somewhere else and paste the link instead.`,
    };
  }

  const contentType = contentTypeForFile(file.name, file.type);
  if (!contentType) {
    return { error: `Couldn't tell what kind of file ${file.name} is — try renaming it with its extension.` };
  }
  if (!policy.allowed.includes(contentType)) {
    return { error: `${contentType} files can't be uploaded here — paste a link to it instead.` };
  }

  return { contentType };
}

