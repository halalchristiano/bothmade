import { describe, expect, it } from 'vitest';
import { clientWantsEmail } from '@/lib/email-preferences';

/**
 * The failure this fixes is invisible from both sides: we believe the client
 * was told, they never heard from us, and the first anyone knows is a client
 * saying they had no idea their design was ready.
 */

describe('whether to email a client', () => {
  it('emails a client who has no preferences row at all', () => {
    // Every default in the schema is true — the intent is opt-out, and the
    // code was reading a missing row as opt-in.
    expect(clientWantsEmail(null, 'messages')).toBe(true);
    expect(clientWantsEmail(undefined, 'statusUpdates')).toBe(true);
  });

  it('emails when the switches are on', () => {
    expect(clientWantsEmail({ notificationsEnabled: true, messages: true }, 'messages')).toBe(true);
  });

  it('respects a switch turned off', () => {
    expect(clientWantsEmail({ notificationsEnabled: true, messages: false }, 'messages')).toBe(false);
  });

  it('respects the master switch over everything', () => {
    expect(clientWantsEmail({ notificationsEnabled: false, messages: true }, 'messages')).toBe(false);
  });

  it('keeps the two kinds independent', () => {
    const prefs = { notificationsEnabled: true, messages: false, statusUpdates: true };

    expect(clientWantsEmail(prefs, 'messages')).toBe(false);
    expect(clientWantsEmail(prefs, 'statusUpdates')).toBe(true);
  });

  /** A partial row must not read as a refusal. */
  it('treats an unset switch as on', () => {
    expect(clientWantsEmail({ notificationsEnabled: true }, 'messages')).toBe(true);
  });
});
