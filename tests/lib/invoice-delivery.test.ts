import { describe, expect, it } from 'vitest';
import {
  MACHINE_OPEN_WINDOW_MS,
  SILENCE_CONCERNING_AFTER_MS,
  openPixelUrl,
  readDelivery,
} from '@/lib/invoice-delivery';

const SENT = new Date('2026-08-01T09:00:00Z');

function facts(over: Partial<Parameters<typeof readDelivery>[0]> = {}) {
  return {
    status: 'due',
    emailSentAt: SENT,
    emailOpenedAt: null,
    emailOpens: 0,
    linkClickedAt: null,
    linkClicks: 0,
    ...over,
  };
}

describe('readDelivery', () => {
  it('says nothing is owed once it is paid', () => {
    const r = readDelivery(facts({ status: 'paid' }));
    expect(r.state).toBe('paid');
    expect(r.nextStep).toBeNull();
    expect(r.concerning).toBe(false);
  });

  it('distinguishes never-sent from sent-and-silent', () => {
    expect(readDelivery(facts({ emailSentAt: null })).state).toBe('not-sent');
    expect(readDelivery(facts(), new Date(SENT.getTime() + 3600_000)).state).toBe('no-signal');
  });

  it('holds its tongue for the first day of silence', () => {
    const soon = new Date(SENT.getTime() + SILENCE_CONCERNING_AFTER_MS - 1000);
    const r = readDelivery(facts(), soon);
    expect(r.concerning).toBe(false);
    expect(r.nextStep).toBeNull();
  });

  it('calls out silence that has gone on long enough to mean something', () => {
    const later = new Date(SENT.getTime() + SILENCE_CONCERNING_AFTER_MS + 1000);
    const r = readDelivery(facts(), later);
    expect(r.state).toBe('no-signal');
    expect(r.concerning).toBe(true);
    expect(r.nextStep).toMatch(/address/i);
  });

  it('never claims a person read it when the open looks like a machine', () => {
    const openedAt = new Date(SENT.getTime() + MACHINE_OPEN_WINDOW_MS - 1);
    const r = readDelivery(facts({ emailOpenedAt: openedAt, emailOpens: 1 }));
    expect(r.state).toBe('delivered');
    expect(r.headline).toMatch(/reached their mailbox/i);
    expect(r.headline).not.toMatch(/read/i);
    expect(r.concerning).toBe(false);
  });

  it('calls a later open an open', () => {
    const openedAt = new Date(SENT.getTime() + MACHINE_OPEN_WINDOW_MS + 60_000);
    const r = readDelivery(facts({ emailOpenedAt: openedAt, emailOpens: 2 }));
    expect(r.headline).toMatch(/opened/i);
  });

  it('lets a click outrank an open — it is the stronger fact', () => {
    const r = readDelivery(
      facts({
        emailOpenedAt: new Date(SENT.getTime() + 3600_000),
        emailOpens: 3,
        linkClickedAt: new Date(SENT.getTime() + 7200_000),
        linkClicks: 1,
      })
    );
    expect(r.state).toBe('clicked');
    expect(r.nextStep).toMatch(/call/i);
  });

  it('counts repeat clicks in the headline', () => {
    const r = readDelivery(
      facts({ linkClickedAt: new Date(SENT.getTime() + 7200_000), linkClicks: 4 })
    );
    expect(r.headline).toMatch(/4 times/);
  });

  it('accepts ISO strings as readily as Dates — the API serialises them', () => {
    const fromApi = readDelivery(
      facts({ emailSentAt: SENT.toISOString(), emailOpenedAt: new Date(SENT.getTime() + 3600_000).toISOString() })
    );
    expect(fromApi.state).toBe('delivered');
  });

  it('treats an unparseable date as absent rather than throwing', () => {
    const r = readDelivery(facts({ emailSentAt: 'not a date' }));
    expect(r.state).toBe('not-sent');
  });
});

describe('openPixelUrl', () => {
  it('builds one path segment, trailing slash or not', () => {
    expect(openPixelUrl('https://bothmade.studio', 'abc')).toBe('https://bothmade.studio/e/abc');
    expect(openPixelUrl('https://bothmade.studio/', 'abc')).toBe('https://bothmade.studio/e/abc');
  });

  it('encodes an id that would otherwise break the path', () => {
    expect(openPixelUrl('https://x.dev', 'a/b?c')).toBe('https://x.dev/e/a%2Fb%3Fc');
  });
});
