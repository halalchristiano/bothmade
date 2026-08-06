/**
 * What was actually made, and therefore what the email may claim.
 *
 * `preview` is the usual case and the one the standard wording was written
 * for: a working build the client clicks around. `visuals` is designs —
 * screens, a concept, pictures of the thing rather than the thing.
 *
 * They needed separating because the mockup email says "a working preview,
 * not a picture of one", and once that was untrue. The send button was
 * correctly not pressed, the client got a hand-written email instead, and the
 * lead then sat on the build queue as outstanding work forever. A claim the
 * email cannot always make should be a choice, not a reason to abandon the
 * tracked send.
 *
 * In its own file rather than in lib/email.ts because the send panel is a
 * client component: importing the type from there pulled Resend, the Gmail
 * transports and node:async_hooks into the browser bundle and failed the
 * build. A shared vocabulary with no dependencies can live on both sides.
 */

export type MockupKind = 'preview' | 'visuals';

export const MOCKUP_KINDS: Array<{ value: MockupKind; label: string; hint: string }> = [
  {
    value: 'preview',
    label: 'A working preview',
    hint: 'A real build they can click around. The usual case.',
  },
  {
    value: 'visuals',
    label: 'Designs to look at',
    hint: 'Screens, a concept, images — not something clickable yet.',
  },
];

/** Anything unrecognised is the usual case, never an unknown word to a client. */
export function readMockupKind(value: unknown): MockupKind {
  return value === 'visuals' ? 'visuals' : 'preview';
}
