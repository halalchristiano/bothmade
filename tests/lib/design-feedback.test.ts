import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_KINDS,
  INCLUDED_REVISION_ROUNDS,
  acknowledgement,
  consumesRound,
  isFeedbackKind,
  kindSpec,
  readFeedbackDraft,
  revisionState,
  triage,
  type FeedbackItem,
} from '@/lib/design-feedback';

const item = (kind: FeedbackItem['kind'], detail = 'x'): FeedbackItem => ({
  area: 'Homepage',
  kind,
  detail,
});

describe('the contract numbers', () => {
  it('allows two included rounds, per Exhibit A', () => {
    expect(INCLUDED_REVISION_ROUNDS).toBe(2);
  });

  it('offers exactly the three buckets the agreement prices differently', () => {
    expect(FEEDBACK_KINDS.map((k) => k.kind)).toEqual(['not-as-agreed', 'change', 'new']);
  });

  it('only charges a round for an in-scope change', () => {
    expect(kindSpec('not-as-agreed')!.countsAgainstAllowance).toBe(false);
    expect(kindSpec('change')!.countsAgainstAllowance).toBe(true);
    expect(kindSpec('new')!.countsAgainstAllowance).toBe(false);
  });

  it('never tells the client that new scope costs money', () => {
    // That is a decision for a person, and pre-announcing a bill on the form
    // would price the studio's work for it.
    const copy = `${kindSpec('new')!.label} ${kindSpec('new')!.help}`.toLowerCase();
    expect(copy).not.toMatch(/charge|bill|cost|fee|extra|pay/);
  });
});

describe('consumesRound', () => {
  it('spends a round when they ask for an in-scope change', () => {
    expect(consumesRound([item('change')])).toBe(true);
  });

  it('does not spend a round on our own non-conformance', () => {
    expect(consumesRound([item('not-as-agreed'), item('not-as-agreed')])).toBe(false);
  });

  it('does not spend a round on new scope alone — that is Section 9, not a revision', () => {
    expect(consumesRound([item('new'), item('new')])).toBe(false);
  });

  it('spends exactly one round however many changes are in the list', () => {
    const many = [item('change'), item('change'), item('change'), item('not-as-agreed')];
    expect(consumesRound(many)).toBe(true);
  });

  it('spends nothing on an empty list', () => {
    expect(consumesRound([])).toBe(false);
  });
});

describe('revisionState', () => {
  it('counts the first submission as revision 1 of 2', () => {
    const s = revisionState(0);
    expect(s.remaining).toBe(2);
    expect(s.nextIsBillable).toBe(false);
    expect(s.clientLine).toMatch(/revision 1 of the 2/i);
  });

  it('warns on the last included round', () => {
    expect(revisionState(1).clientLine).toMatch(/last included round/i);
  });

  it('says plainly when both are gone, without threatening a bill', () => {
    const s = revisionState(2);
    expect(s.remaining).toBe(0);
    expect(s.nextIsBillable).toBe(true);
    expect(s.clientLine).toMatch(/used both/i);
    expect(s.clientLine).toMatch(/come back to you/i);
  });

  it('never goes negative, however overspent', () => {
    const s = revisionState(9);
    expect(s.remaining).toBe(0);
    expect(s.used).toBe(9);
  });

  it('floors a nonsense count rather than propagating it', () => {
    expect(revisionState(-3).used).toBe(0);
    expect(revisionState(1.7).used).toBe(1);
  });
});

describe('readFeedbackDraft', () => {
  it('accepts a normal submission', () => {
    const d = readFeedbackDraft({
      liked: 'The typography is great',
      items: [{ area: 'Hero', kind: 'change', detail: 'Too much white space' }],
      note: null,
    });
    expect(d.ok).toBe(true);
    expect(d.submission!.items).toHaveLength(1);
    expect(d.submission!.liked).toBe('The typography is great');
  });

  it('drops a blank row instead of losing everything else they wrote', () => {
    const d = readFeedbackDraft({
      items: [
        { area: 'Hero', kind: 'change', detail: 'Too tight' },
        { area: '', kind: 'change', detail: '   ' },
      ],
    });
    expect(d.ok).toBe(true);
    expect(d.submission!.items).toHaveLength(1);
  });

  it('refuses an item with no kind — the whole point is the sorting', () => {
    const d = readFeedbackDraft({ items: [{ area: 'Hero', kind: 'whatever', detail: 'x' }] });
    expect(d.ok).toBe(false);
    expect(d.error).toMatch(/which kind/i);
  });

  it('refuses a submission with nothing actionable in it', () => {
    expect(readFeedbackDraft({ items: [], note: null }).ok).toBe(false);
    expect(readFeedbackDraft({}).ok).toBe(false);
    expect(readFeedbackDraft(null).ok).toBe(false);
  });

  it('accepts a bare note with no itemised list', () => {
    const d = readFeedbackDraft({ note: 'Can we talk this one through on a call?' });
    expect(d.ok).toBe(true);
    expect(d.submission!.items).toHaveLength(0);
  });

  it('defaults a missing area rather than rejecting the note', () => {
    const d = readFeedbackDraft({ items: [{ kind: 'change', detail: 'Feels cold' }] });
    expect(d.submission!.items[0].area).toBe('The design overall');
  });

  it('bounds every field', () => {
    const d = readFeedbackDraft({
      liked: 'a'.repeat(9000),
      note: 'b'.repeat(9000),
      items: Array.from({ length: 40 }, () => ({ area: 'c'.repeat(500), kind: 'change', detail: 'd'.repeat(9000) })),
    });
    expect(d.submission!.items.length).toBeLessThanOrEqual(25);
    expect(d.submission!.liked!.length).toBeLessThanOrEqual(4000);
    expect(d.submission!.note!.length).toBeLessThanOrEqual(4000);
    expect(d.submission!.items[0].area.length).toBeLessThanOrEqual(120);
    expect(d.submission!.items[0].detail.length).toBeLessThanOrEqual(2000);
  });

  it('ignores junk in the items array', () => {
    const d = readFeedbackDraft({
      items: ['nope', 42, null, { area: 'Hero', kind: 'change', detail: 'ok' }],
    });
    expect(d.ok).toBe(true);
    expect(d.submission!.items).toHaveLength(1);
  });
});

describe('triage', () => {
  it('splits the three buckets and flags what needs a person', () => {
    const t = triage([item('not-as-agreed'), item('change'), item('new'), item('new')]);
    expect(t.notAsAgreed).toHaveLength(1);
    expect(t.changes).toHaveLength(1);
    expect(t.newScope).toHaveLength(2);
    expect(t.consumedRound).toBe(true);
    expect(t.needsQuote).toBe(true);
  });

  it('needs no quote when nothing is new', () => {
    expect(triage([item('change')]).needsQuote).toBe(false);
  });
});

describe('acknowledgement', () => {
  it('tells them the non-conformances are free and outside the allowance', () => {
    const items = [item('not-as-agreed')];
    const text = acknowledgement(triage(items), revisionState(0));
    expect(text).toMatch(/no charge/i);
    expect(text).toMatch(/doesn't use up a revision round/i);
  });

  it('says a round was used, and how many are left', () => {
    const text = acknowledgement(triage([item('change')]), revisionState(1));
    expect(text).toMatch(/revision 1 of 2 used/i);
    expect(text).toMatch(/1 left/i);
  });

  it('says both are gone without naming a price', () => {
    const text = acknowledgement(triage([item('change')]), revisionState(2));
    expect(text).toMatch(/both of your included revision rounds/i);
    expect(text.toLowerCase()).not.toMatch(/charge|invoice|\$/);
  });

  it('stops saying "both used" once they are past the allowance', () => {
    // Right the moment the second round goes; on the fourth request it reads
    // like the software has lost count.
    const text = acknowledgement(triage([item('change')]), revisionState(3));
    expect(text).toMatch(/past the 2 revision rounds/i);
    expect(text).not.toMatch(/both of your included/i);
    expect(text.toLowerCase()).not.toMatch(/charge|invoice|\$/);
  });

  it('does not promise the next version in the same breath as saying it will check first', () => {
    const spent = acknowledgement(triage([item('change')]), revisionState(2));
    expect(spent).toMatch(/be in touch before we start/i);
    expect(spent).not.toMatch(/back with the next version/i);

    // With rounds left, the next version IS the next thing to happen.
    const withRoomLeft = acknowledgement(triage([item('change')]), revisionState(1));
    expect(withRoomLeft).toMatch(/back with the next version/i);
  });

  it('mentions new scope as something we will come back on, not something billed', () => {
    const text = acknowledgement(triage([item('new')]), revisionState(0));
    expect(text).toMatch(/come back to you separately/i);
    expect(text.toLowerCase()).not.toMatch(/charge|bill|cost/);
  });

  it('counts every note, whatever the mix', () => {
    const text = acknowledgement(
      triage([item('change'), item('new'), item('not-as-agreed')]),
      revisionState(1)
    );
    expect(text).toMatch(/all 3 of your notes/i);
  });

  it('counts like a person rather than a machine at small numbers', () => {
    const one = acknowledgement(triage([item('not-as-agreed')]), revisionState(0));
    expect(one).toMatch(/we've got your note/i);
    expect(one).toMatch(/one of them says/i);

    // "all 2 of your notes" and "2 of them say" out of two is how software
    // sounds; a person says "both".
    const two = acknowledgement(
      triage([item('not-as-agreed'), item('not-as-agreed')]),
      revisionState(0)
    );
    expect(two).toMatch(/both of your notes/i);
    expect(two).toMatch(/both say something/i);
    expect(two).not.toMatch(/all 2|2 of them/i);

    // All of them, but more than two.
    const three = acknowledgement(
      triage([item('not-as-agreed'), item('not-as-agreed'), item('not-as-agreed')]),
      revisionState(0)
    );
    expect(three).toMatch(/they all say something/i);

    // Some but not all still counts them.
    const mixed = acknowledgement(
      triage([item('not-as-agreed'), item('not-as-agreed'), item('change')]),
      revisionState(1)
    );
    expect(mixed).toMatch(/2 of them say something/i);
  });
});

describe('isFeedbackKind', () => {
  it('accepts the three and nothing else', () => {
    expect(isFeedbackKind('change')).toBe(true);
    expect(isFeedbackKind('not-as-agreed')).toBe(true);
    expect(isFeedbackKind('new')).toBe(true);
    expect(isFeedbackKind('other')).toBe(false);
    expect(isFeedbackKind(null)).toBe(false);
  });
});
