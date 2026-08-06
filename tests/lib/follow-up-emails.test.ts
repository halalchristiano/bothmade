import { describe, expect, it } from 'vitest';

/**
 * The drafts that appear after a call is logged.
 *
 * These exist because of two things that reached a real customer. One email
 * was written by one of us and signed by the other, because the draft signed
 * with whoever happened to own the lead rather than whoever made the call.
 * The same email carried "• (add the two or three things you discussed)" —
 * an instruction to the sender, sent to the client, under a heading
 * announcing the things we had discussed.
 *
 * Both are the same class of mistake: a draft that assumes it will be read
 * before it is sent. It will not always be. So the rule these hold to is that
 * every draft has to be sendable exactly as it stands.
 */

import { buildFollowUpDraft, type FollowUpContext } from '@/lib/follow-up-emails';
import type { SalesPoint } from '@/lib/leads';

const OUTCOMES = [
  'no-answer',
  'voicemail',
  'gatekeeper',
  'spoke-callback',
  'spoke-interested',
  'sending-proposal',
  'meeting-booked',
];

const POINTS: SalesPoint[] = [
  { point: 'Nobody can book a survey without ringing', priceCents: null },
  { point: 'The site is unreadable on a phone', priceCents: null },
] as SalesPoint[];

const ctx = (over: Partial<FollowUpContext> = {}): FollowUpContext => ({
  company: 'Roofing LTD',
  contactName: 'Lauren Hayes',
  essentials: [],
  low: null,
  high: null,
  ...over,
});

describe('every draft, whatever the outcome', () => {
  /**
   * The bug as it happened: Kiana made the call, Evan owned the lead, and
   * Lauren got an email from Kiana signed by Evan. Nothing here knows who is
   * actually sending, so it names nobody rather than guessing wrong in front
   * of a customer.
   */
  it('signs as the studio, never as a person', () => {
    for (const outcome of OUTCOMES) {
      const draft = buildFollowUpDraft(outcome, ctx({ essentials: POINTS }))!;

      expect(draft.body, outcome).toContain('Thanks,\nBothmade');
      expect(draft.body, outcome).not.toMatch(/Evan|Kiana|Buoncristiano/);
    }
  });

  /**
   * A bracketed instruction is a note to ourselves. One went out. The test is
   * blunt on purpose: no draft may contain a parenthesis at the start of a
   * line, which is the shape every one of these placeholders had.
   */
  it('carries no instruction to the sender, with nothing filled in', () => {
    for (const outcome of OUTCOMES) {
      const draft = buildFollowUpDraft(outcome, ctx())!;

      expect(draft.body, outcome).not.toMatch(/^[•\-*]?\s*\(/m);
      expect(draft.body, outcome).not.toMatch(/\b(add|list|insert|fill in) the\b/i);
    }
  });

  it('is sendable as it stands, with nothing known about the lead', () => {
    for (const outcome of OUTCOMES) {
      const draft = buildFollowUpDraft(outcome, ctx({ contactName: null }))!;

      expect(draft.subject, outcome).toContain('Roofing LTD');
      expect(draft.body, outcome).toMatch(/^Hi\b/);
      // No stray blank paragraphs where an omitted section used to be.
      expect(draft.body, outcome).not.toMatch(/\n{4,}/);
    }
  });

  /** A clear no, or a dead number, gets no email. Sending one is how a domain gets reported. */
  it('writes nothing after an outcome that deserves silence', () => {
    expect(buildFollowUpDraft('not-interested', ctx())).toBeNull();
    expect(buildFollowUpDraft('wrong-number', ctx())).toBeNull();
  });
});

describe('the points discussed', () => {
  it('lists them when the call produced some', () => {
    const draft = buildFollowUpDraft('spoke-interested', ctx({ essentials: POINTS }))!;

    expect(draft.body).toContain('the things that would make the biggest difference are');
    expect(draft.body).toContain('• Nobody can book a survey without ringing');
  });

  /** Both lines or neither — a heading with nothing under it reads as a mistake. */
  it('drops the heading too when the call produced none', () => {
    const draft = buildFollowUpDraft('spoke-interested', ctx())!;

    expect(draft.body).not.toContain('the things that would make the biggest difference are');
    expect(draft.body).toContain('Any questions');
  });

  it('does the same in the proposal draft', () => {
    const withNone = buildFollowUpDraft('sending-proposal', ctx())!;
    const withSome = buildFollowUpDraft('sending-proposal', ctx({ essentials: POINTS }))!;

    expect(withNone.body).not.toContain('•');
    expect(withSome.body).toContain('• The site is unreadable on a phone');
  });
});

describe('the price line', () => {
  it('gives a range when there is one, and stays quiet when there is not', () => {
    const range = buildFollowUpDraft('sending-proposal', ctx({ low: 750000, high: 1200000 }))!;
    const silent = buildFollowUpDraft('sending-proposal', ctx())!;

    expect(range.body).toMatch(/\$7,500[\s\S]*\$12,000/);
    expect(silent.body).not.toMatch(/\$/);
  });
});
