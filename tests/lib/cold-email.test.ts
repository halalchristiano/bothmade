import { describe, expect, it } from 'vitest';
import {
  FALLBACK_FIRST_NAME,
  FALLBACK_SENDER_NAME,
  draftBodyOnly,
  firstNameOf,
  personalize,
  renderColdEmail,
  splitDraft,
} from '@/lib/cold-email';
import { buildFallbackColdEmailDraft } from '@/lib/leads';

/**
 * These functions decide what a prospect actually reads. The failure mode
 * this file exists to catch is a literal "Hi [First Name]," reaching an
 * inbox — the single most expensive typo in cold outreach.
 */

describe('splitDraft', () => {
  it('separates the subject line from the body', () => {
    expect(splitDraft('Subject: Thoughts on Acme\n\nHi there,\n\nBody.', 'Acme')).toEqual({
      subject: 'Thoughts on Acme',
      body: 'Hi there,\n\nBody.',
    });
  });

  it('handles CRLF line endings from pasted drafts', () => {
    expect(splitDraft('Subject: Hello\r\n\r\nBody text', 'Acme').subject).toBe('Hello');
    expect(splitDraft('Subject: Hello\r\n\r\nBody text', 'Acme').body).toBe('Body text');
  });

  it('is case-insensitive about the Subject label', () => {
    expect(splitDraft('SUBJECT: Shouty\n\nBody', 'Acme').subject).toBe('Shouty');
  });

  it('invents a subject when the draft has none, rather than sending a blank one', () => {
    expect(splitDraft('Hi there, just reaching out.', 'Acme')).toEqual({
      subject: 'Thoughts on Acme',
      body: 'Hi there, just reaching out.',
    });
  });

  it('does not treat a mid-body "Subject:" as the subject line', () => {
    const { subject } = splitDraft('Hello.\n\nSubject: not really\n\nMore.', 'Acme');
    expect(subject).toBe('Thoughts on Acme');
  });

  it('keeps colons inside the subject', () => {
    expect(splitDraft('Subject: Re: your site\n\nBody', 'Acme').subject).toBe('Re: your site');
  });

  it('trims surrounding whitespace off both parts', () => {
    expect(splitDraft('Subject:   Padded   \n\n   Body   ', 'Acme')).toEqual({
      subject: 'Padded',
      body: 'Body',
    });
  });
});

describe('draftBodyOnly', () => {
  it('drops the subject line', () => {
    expect(draftBodyOnly('Subject: Anything\n\nJust the body.')).toBe('Just the body.');
  });

  it('returns the whole draft when there is no subject line', () => {
    expect(draftBodyOnly('Just the body.')).toBe('Just the body.');
  });
});

describe('firstNameOf', () => {
  it('takes the first word', () => {
    expect(firstNameOf('Frell Handa')).toBe('Frell');
  });

  it('handles a single name', () => {
    expect(firstNameOf('Frell')).toBe('Frell');
  });

  it('collapses stray whitespace instead of returning an empty greeting', () => {
    expect(firstNameOf('   Frell   Handa  ')).toBe('Frell');
    expect(firstNameOf('   ')).toBe(FALLBACK_FIRST_NAME);
  });

  it('falls back to "there" when there is no name at all', () => {
    expect(firstNameOf(null)).toBe('there');
    expect(firstNameOf(undefined)).toBe('there');
    expect(firstNameOf('')).toBe('there');
  });
});

describe('personalize', () => {
  it('resolves both tokens', () => {
    expect(personalize('Hi [First Name],\n\n[Sender Name]', { firstName: 'Frell', senderName: 'Evan' })).toBe(
      'Hi Frell,\n\nEvan'
    );
  });

  it('is case-insensitive, because drafts are hand-written', () => {
    expect(personalize('Hi [FIRST NAME] and [first name]', { firstName: 'Frell' })).toBe(
      'Hi Frell and Frell'
    );
  });

  it('replaces every occurrence, not just the first', () => {
    expect(personalize('[First Name] [First Name] [First Name]', { firstName: 'X' })).toBe('X X X');
  });

  it('signs off with the team name when no sender is known', () => {
    expect(personalize('[Sender Name]', { firstName: 'Frell' })).toBe(FALLBACK_SENDER_NAME);
  });

  it('leaves text without tokens untouched', () => {
    expect(personalize('No tokens here.', { firstName: 'Frell' })).toBe('No tokens here.');
  });
});

describe('renderColdEmail', () => {
  const lead = { company: 'Linpotia Cafe', contactName: 'Frell Handa' };

  it('splits and personalizes in one pass', () => {
    expect(renderColdEmail('Subject: Hi\n\nHi [First Name],\n\n[Sender Name]', lead, 'Evan')).toEqual({
      subject: 'Hi',
      body: 'Hi Frell,\n\nEvan',
    });
  });

  it('personalizes the subject too', () => {
    expect(renderColdEmail('Subject: A note for [First Name]\n\nBody', lead, 'Evan').subject).toBe(
      'A note for Frell'
    );
  });

  it('greets a nameless contact without leaving a hole', () => {
    const { body } = renderColdEmail('Subject: Hi\n\nHi [First Name],', { ...lead, contactName: null }, 'Evan');
    expect(body).toBe('Hi there,');
  });

  it('leaves no unresolved placeholder in a generated fallback draft', () => {
    // This is the exact path "Send all now" takes for a lead with no
    // bespoke draft, and it is the one that must never ship a bracket.
    const draft = buildFallbackColdEmailDraft({
      company: 'Linpotia Cafe',
      painPoints: 'slow-site',
      personalizedObservation: null,
    });
    const { subject, body } = renderColdEmail(draft, lead, 'Evan');

    expect(subject).not.toMatch(/\[.+?\]/);
    expect(body).not.toMatch(/\[.+?\]/);
    expect(body).toContain('Hi Frell,');
    expect(body.trimEnd().endsWith('Evan')).toBe(true);
  });

  it('produces the same output the bulk composer path would, minus the subject', () => {
    const draft = 'Subject: Hi\n\nHi [First Name], welcome.';
    const { body } = renderColdEmail(draft, lead, 'Evan');
    const bulkBody = personalize(draftBodyOnly(draft), { firstName: firstNameOf(lead.contactName) });

    expect(bulkBody).toBe(body);
  });
});
