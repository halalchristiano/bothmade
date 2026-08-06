import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Show the email before it goes, every time.
 *
 * A follow-up went out signed by the wrong person, and the person who sent
 * it only found out because the customer's reply said so. A draft carrying
 * "• (add the two or three things you discussed)" reached a client the same
 * way. Both were readable — nobody read them, because there was nothing
 * between pressing a button and the message leaving.
 *
 * So: nothing leaves this application on a single click. Every send from a
 * button first renders the exact message it is about to send, and waits.
 *
 * ## How it does that without sending anything
 *
 * The `sendXEmail` functions in lib/email.ts are pure composition followed by
 * one call to the transport — they read nothing and write nothing. So a
 * preview is just that same function, run with the transport intercepted:
 *
 *     const [mail] = await composeOnly(() => sendMockupEmail(input));
 *
 * `mail` is byte-for-byte what would have been transmitted, because it *is*
 * the object that would have been transmitted. There is no second template
 * to keep in step with the first, and nothing can drift.
 *
 * Interception is at the transport rather than in the routes on purpose. A
 * route stamps rows, logs activity and moves stages around its send, so
 * running one "for a preview" would leave a lead marked as having been sent
 * something nobody has agreed to send yet.
 */

/** A message as it would go out. Everything a person needs to judge it. */
export interface ComposedEmail {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string | null;
  /** Filenames only — the bytes are large and nobody is reading them here. */
  attachments?: string[];
}

interface PreviewStore {
  captured: ComposedEmail[];
}

const store = new AsyncLocalStorage<PreviewStore>();

/**
 * Run something that sends email, and collect the mail instead of sending it.
 *
 * Anything called inside — however deep — hands its message over rather than
 * transmitting it. The senders still report success, so a caller that
 * branches on the result behaves exactly as it would on a real send.
 */
export async function composeOnly(fn: () => Promise<unknown>): Promise<ComposedEmail[]> {
  const captured: ComposedEmail[] = [];
  await store.run({ captured }, fn);
  return captured;
}

/** Whether the current call is inside a preview. */
export function composing(): boolean {
  return store.getStore() !== undefined;
}

/**
 * Hand a message to the preview instead of the network.
 *
 * Returns false when nothing is previewing, which is the normal path — the
 * caller then sends as it always has. The senders call this before doing
 * anything else at all, so a preview never reaches Gmail, Resend, or the
 * database lookups the delegated path would otherwise make.
 */
export function captureForPreview(mail: ComposedEmail): boolean {
  const current = store.getStore();
  if (!current) return false;
  current.captured.push(mail);
  return true;
}
