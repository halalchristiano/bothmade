/**
 * Cold-email draft handling, in one place.
 *
 * `splitDraft` and the `[First Name]` / `[Sender Name]` substitution existed
 * in three copies — the send route, the preview modal, and the import
 * modal — each with a comment promising it mirrored the others. The preview
 * is the studio's only check on what a cold email actually says before it
 * goes to a stranger, so "the preview and the send drifted apart" is a
 * class of bug that ends with somebody receiving `Hi [First Name],`.
 *
 * One implementation, imported by all three.
 */

export interface ParsedDraft {
  subject: string;
  body: string;
}

/**
 * Splits a "Subject: ...\n\n<body>" draft into its parts.
 *
 * Falls back to a generic subject when the draft has no Subject line —
 * research-imported drafts should always carry one, but the field is
 * freeform text a human typed, so it sometimes doesn't.
 */
export function splitDraft(draft: string, company: string): ParsedDraft {
  const match = draft.match(/^Subject:\s*(.+?)\r?\n+([\s\S]*)$/i);
  if (match) {
    return { subject: match[1].trim(), body: match[2].trim() };
  }
  return { subject: `Thoughts on ${company}`, body: draft.trim() };
}

/** First word of a contact name, or a usable stand-in. */
export function firstNameOf(contactName: string | null | undefined): string {
  return contactName?.trim().split(/\s+/)[0] || 'there';
}

/**
 * Fills the placeholders a draft is written with.
 *
 * Case-insensitive and global on purpose: drafts are hand-written, and
 * "[first name]" appearing twice in one email is not the recipient's
 * problem.
 */
export function personalizeDraft(
  body: string,
  opts: { contactName?: string | null; senderName?: string | null }
): string {
  return body
    .replace(/\[First Name\]/gi, firstNameOf(opts.contactName))
    .replace(/\[Sender Name\]/gi, opts.senderName || 'The Bothmade Team');
}

/**
 * Turns a plain-text draft body into the HTML actually sent — blank lines
 * become paragraphs, single newlines become breaks.
 *
 * The text is escaped first. A draft is typed into a textarea by a human,
 * and one stray `<` used to eat the remainder of the email silently.
 */
export function draftBodyToHtml(body: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  return body
    .split(/\n{2,}/)
    .map((para) => `<p>${escape(para).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/** Everything the send and preview paths need, derived identically. */
export function buildColdEmail(opts: {
  draft: string;
  company: string;
  contactName?: string | null;
  senderName?: string | null;
}): { subject: string; body: string; html: string } {
  const { subject, body } = splitDraft(opts.draft, opts.company);
  const personalized = personalizeDraft(body, {
    contactName: opts.contactName,
    senderName: opts.senderName,
  });
  return { subject, body: personalized, html: draftBodyToHtml(personalized) };
}
