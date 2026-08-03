import { describe, expect, it } from 'vitest';
import { buildColdEmail, personalizeDraft, splitDraft } from '@/lib/cold-email';

describe('splitDraft', () => {
  it('splits a Subject: header from the body', () => {
    const { subject, body } = splitDraft('Subject: Hello\n\nFirst para.', 'Acme');
    expect(subject).toBe('Hello');
    expect(body).toBe('First para.');
  });
  it('falls back to a generic subject', () => {
    expect(splitDraft('no header here', 'Acme').subject).toBe('Thoughts on Acme');
  });
});

describe('personalizeDraft', () => {
  it('fills placeholders case-insensitively and globally', () => {
    const out = personalizeDraft('Hi [first name], — [FIRST NAME]. — [Sender Name]', {
      contactName: 'Dave Duran', senderName: 'Evan',
    });
    expect(out).toBe('Hi Dave, — Dave. — Evan');
  });
  it('degrades to "there" with no contact name', () => {
    expect(personalizeDraft('Hi [First Name],', {})).toBe('Hi there,');
  });
});

describe('buildColdEmail', () => {
  it('escapes the body so a stray < cannot eat the email', () => {
    const { html } = buildColdEmail({
      draft: 'Subject: Hi\n\nPrices <under $500> & falling.', company: 'Acme',
    });
    expect(html).toContain('&lt;under $500&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<under');
  });
  it('turns blank lines into paragraphs', () => {
    const { html } = buildColdEmail({ draft: 'Subject: Hi\n\nOne.\n\nTwo.', company: 'A' });
    expect(html.match(/<p>/g)?.length).toBe(2);
  });
});
