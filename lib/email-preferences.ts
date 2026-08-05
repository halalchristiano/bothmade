/**
 * Whether a client wants a given email.
 *
 * The EmailPreferences row defaults every switch to true — the intent is
 * plainly opt-out. The code read it as opt-in: `prefs?.messages` on a client
 * with no row at all is undefined, so nothing was sent. A row is created at
 * project creation and by the Stripe webhook, which covers most clients and
 * silently misses any onboarded another way or predating that code, and the
 * failure is invisible from both sides — we think we told them, they never
 * heard from us, and the first anyone knows is a client saying they had no
 * idea the design was ready.
 *
 * So a missing row means the defaults, which is what the schema says it
 * means. Only an explicit false suppresses anything.
 */

export interface ClientEmailPreferences {
  notificationsEnabled?: boolean | null;
  statusUpdates?: boolean | null;
  messages?: boolean | null;
}

export type EmailKind = 'statusUpdates' | 'messages';

export function clientWantsEmail(
  prefs: ClientEmailPreferences | null | undefined,
  kind: EmailKind
): boolean {
  if (!prefs) return true; // no row — the schema's defaults, all on
  if (prefs.notificationsEnabled === false) return false;
  return prefs[kind] !== false;
}
