/**
 * One source of truth for how a cold-email draft is turned into the thing
 * that actually lands in someone's inbox.
 *
 * This used to live in three places — the send route, the pre-send preview
 * modal, and the bulk composer — each with its own copy of the "Subject:"
 * split and its own `[First Name]` replacement. A preview that doesn't match
 * the send is worse than no preview at all, so all three now call these.
 */

/** What a draft's placeholder tokens get resolved against at send time. */
export interface PersonalizationTokens {
  /** Resolves `[First Name]`. */
  firstName: string;
  /** Resolves `[Sender Name]`. */
  senderName?: string;
}

/** The greeting used when a lead has no contact name on file. */
export const FALLBACK_FIRST_NAME = 'there';

/** The sender line used before the logged-in user's real name is known. */
export const FALLBACK_SENDER_NAME = 'The Bothmade Team';

/**
 * Splits a "Subject: ...\n\n<body>" draft into its parts. Falls back to a
 * generic subject if the draft doesn't start with a Subject line, since
 * research-imported drafts should always have one but the field is freeform.
 */
export function splitDraft(draft: string, company: string): { subject: string; body: string } {
  const match = draft.match(/^Subject:\s*(.+?)\r?\n+([\s\S]*)$/i);
  if (match) {
    return { subject: match[1].trim(), body: match[2].trim() };
  }
  return { subject: `Thoughts on ${company}`, body: draft.trim() };
}

/**
 * Just the body of a draft — for the bulk composer, where one shared subject
 * goes to everybody and each draft's own subject line can't be used.
 */
export function draftBodyOnly(draft: string): string {
  const match = draft.match(/^Subject:\s*.+?\r?\n+([\s\S]*)$/i);
  return (match ? match[1] : draft).trim();
}

/**
 * First name from a full name, for the greeting line. Anything blank or
 * missing becomes "there" — "Hi ," reads like a broken mail merge, which is
 * exactly the impression a cold email cannot afford to give.
 */
export function firstNameOf(contactName: string | null | undefined): string {
  return contactName?.trim().split(/\s+/)[0] || FALLBACK_FIRST_NAME;
}

/**
 * Resolves the placeholder tokens a draft carries. Case-insensitive, since
 * drafts are hand-written and research exports are inconsistent about it.
 */
export function personalize(text: string, tokens: PersonalizationTokens): string {
  return text
    .replace(/\[First Name\]/gi, tokens.firstName)
    .replace(/\[Sender Name\]/gi, tokens.senderName ?? FALLBACK_SENDER_NAME);
}

/**
 * The whole pipeline in one call: split the draft, then resolve its tokens.
 * This is what both the send route and the preview modal run, so what's
 * shown before sending is exactly what gets sent.
 */
export function renderColdEmail(
  draft: string,
  lead: { company: string; contactName: string | null },
  senderName?: string
): { subject: string; body: string } {
  const { subject, body } = splitDraft(draft, lead.company);
  const tokens = { firstName: firstNameOf(lead.contactName), senderName };
  return { subject: personalize(subject, tokens), body: personalize(body, tokens) };
}
