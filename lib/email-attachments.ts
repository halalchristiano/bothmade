/**
 * Attachments that travel as links rather than as files.
 *
 * Every outbound path that matters here — domain-wide delegation, per-user
 * Gmail OAuth — builds a multipart/alternative message and cannot carry a
 * real MIME attachment (see lib/gmail-mime.ts, and the guard in
 * sendEmailDetailed that drops to the provider the moment `attachments` is
 * set). Attaching a file to a templated email would therefore mean giving up
 * sending from the sender's own mailbox, which is the thing keeping these
 * messages out of spam.
 *
 * So a PDF, a picture and a link are all the same object here: a labelled
 * URL, rendered as a button. Google Drive is the intended home for the first
 * two — "Anyone with the link" and paste it in.
 */

import { esc, escMultiline, normalizeUrl, safeUrl } from '@/lib/html';

export type AttachmentKind = 'pdf' | 'image' | 'link';

export interface EmailAttachmentLink {
  kind: AttachmentKind;
  /** The button text — what the recipient reads and clicks. */
  label: string;
  url: string;
  /** One line under the label. Falls back to the link's host. */
  note?: string;
}

export const ATTACHMENT_KINDS: Array<{
  value: AttachmentKind;
  label: string;
  badge: string;
  /** What the button says when nobody typed a label. */
  fallbackLabel: string;
  hint: string;
}> = [
  {
    value: 'pdf',
    label: 'PDF',
    badge: 'PDF',
    fallbackLabel: 'View the PDF',
    hint: 'Upload it to Google Drive, set sharing to "Anyone with the link", and paste that link here.',
  },
  {
    value: 'image',
    label: 'Picture',
    badge: 'IMG',
    fallbackLabel: 'View the image',
    hint: 'A Drive link works, and so does a direct image URL — a direct one also shows a preview inside the email.',
  },
  {
    value: 'link',
    label: 'Link',
    badge: 'LINK',
    fallbackLabel: 'Take a look',
    hint: 'Anything on the web — a live mockup, a Loom, a shared folder.',
  },
];

const KIND_BY_VALUE = new Map(ATTACHMENT_KINDS.map((k) => [k.value, k]));

const MAX_ATTACHMENTS = 8;
const MAX_LABEL = 80;
const MAX_NOTE = 140;

/**
 * Turns whatever arrived over the wire into attachments we're willing to
 * render. Anything without a usable link is dropped rather than rendered as
 * a dead button — the composer blocks these before send, so reaching here
 * means the request didn't come from it.
 */
export function parseAttachments(raw: unknown): EmailAttachmentLink[] {
  if (!Array.isArray(raw)) return [];

  const parsed: EmailAttachmentLink[] = [];
  for (const entry of raw.slice(0, MAX_ATTACHMENTS)) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;

    const url = normalizeUrl(candidate.url);
    if (!url) continue;

    const kind: AttachmentKind = KIND_BY_VALUE.has(candidate.kind as AttachmentKind)
      ? (candidate.kind as AttachmentKind)
      : 'link';

    const label = String(candidate.label ?? '').trim().slice(0, MAX_LABEL);
    const note = String(candidate.note ?? '').trim().slice(0, MAX_NOTE);

    parsed.push({
      kind,
      label: label || KIND_BY_VALUE.get(kind)!.fallbackLabel,
      url,
      ...(note ? { note } : {}),
    });
  }
  return parsed;
}

/** The Google Drive file ID in a share link, if this is one. */
function driveFileId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return null;

  const inPath = /\/file\/d\/([a-zA-Z0-9_-]{10,})/.exec(parsed.pathname);
  if (inPath) return inPath[1];

  const id = parsed.searchParams.get('id');
  return id && /^[a-zA-Z0-9_-]{10,}$/.test(id) ? id : null;
}

const DIRECT_IMAGE = /\.(png|jpe?g|gif|webp|avif)$/i;

/**
 * A URL that renders as an `<img>`, or null when we only have something to
 * link to. Drive share links point at a viewer page, not at pixels, so they
 * go through Drive's thumbnail endpoint — which serves the file only while
 * it's shared with "Anyone with the link". The live preview in the composer
 * hits the same URL, so a file that's still private looks broken there
 * before it ever looks broken in a client's inbox.
 */
export function previewImageUrl(url: string): string | null {
  const driveId = driveFileId(url);
  if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`;

  try {
    return DIRECT_IMAGE.test(new URL(url).pathname) ? url : null;
  } catch {
    return null;
  }
}

/** The host, for the line under a label — "drive.google.com". */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * One attachment as a card: badge, label, a pill on the right, and — for a
 * picture we can resolve to actual pixels — the picture itself above it.
 *
 * Table-based and inline-styled throughout, because half the clients that
 * open these strip `<div>` layout, `flex`, and anything in a `<style>` block.
 * Both the label and the pill carry the same href, so the tap target isn't a
 * single word of text on a phone.
 */
function renderCard(attachment: EmailAttachmentLink): string {
  const href = safeUrl(attachment.url);
  if (!href) return '';

  const kind = KIND_BY_VALUE.get(attachment.kind)!;
  const label = esc(attachment.label);
  const note = attachment.note ? escMultiline(attachment.note) : esc(hostLabel(attachment.url));
  const preview = attachment.kind === 'image' ? previewImageUrl(attachment.url) : null;
  const previewHref = preview ? safeUrl(preview) : null;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; margin:0 0 10px 0; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); border-radius:14px;">
      ${
        previewHref
          ? `<tr>
              <td colspan="3" style="padding:12px 12px 0 12px;">
                <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:block; text-decoration:none;"><img src="${previewHref}" alt="${label}" width="512" style="display:block; width:100%; max-width:100%; height:auto; background-color:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:10px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size:12px; color:rgba(255,255,255,0.35); text-decoration:none;" /></a>
              </td>
            </tr>`
          : ''
      }
      <tr>
        <td width="52" valign="middle" style="padding:14px 0 14px 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="38" height="38" align="center" valign="middle" bgcolor="#6f7ef0" style="width:38px; height:38px; border-radius:11px; background-color:#6f7ef0; background-image:linear-gradient(135deg,#38bdf8,#a855f7); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; font-size:9px; font-weight:800; letter-spacing:0.06em; color:#05030a;">${kind.badge}</td>
          </tr></table>
        </td>
        <td valign="middle" style="padding:14px 8px 14px 12px;">
          <a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#ffffff; font-size:14px; font-weight:700; line-height:1.35; text-decoration:none;">${label}</a>
          ${note ? `<p style="margin:3px 0 0 0; font-size:12px; line-height:1.45; color:rgba(255,255,255,0.4);">${note}</p>` : ''}
        </td>
        <td align="right" valign="middle" style="padding:14px 14px 14px 0;">
          <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:8px 15px; border-radius:999px; background-color:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#7dd3fc; font-size:12px; font-weight:700; line-height:1; text-decoration:none; white-space:nowrap;">Open</a>
        </td>
      </tr>
    </table>`;
}

/**
 * The whole attached block, or an empty string when there's nothing to show
 * — so a template that renders it unconditionally doesn't leave an empty
 * heading behind.
 */
export function renderAttachments(attachments: EmailAttachmentLink[], heading = 'Attached'): string {
  const cards = attachments.map(renderCard).filter(Boolean);
  if (cards.length === 0) return '';

  return `
    <div style="margin-top:26px; padding-top:22px; border-top:1px solid rgba(255,255,255,0.08);">
      <p style="margin:0 0 12px 0; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.38);">${esc(heading)}</p>
      ${cards.join('')}
    </div>`;
}
