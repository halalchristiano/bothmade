import { describe, expect, it } from 'vitest';
import { isAutomatedReply } from '@/lib/auto-reply';

const H = (o: Record<string, string>) =>
  Object.entries(o).map(([name, value]) => ({ name, value }));

// An out-of-office flagged as "wrote back" also cleared bounce flags —
// so a holiday auto-reply could put a dead address back into rotation.
describe('auto-reply detection', () => {
  it.each([
    ['RFC3834 Auto-Submitted', { From: 'a@b.co', 'Auto-Submitted': 'auto-replied' }],
    ['Outlook OOO', { From: 'a@b.co', Subject: 'Automatic reply: Your proposal', 'X-Auto-Response-Suppress': 'All' }],
    ['Gmail vacation', { From: 'a@b.co', Subject: 'Out of Office' }],
    ['on leave', { From: 'a@b.co', Subject: 'Re: quote — I am on maternity leave' }],
    ['left the company', { From: 'a@b.co', Subject: 'Dave is no longer with the company' }],
    ['ticket acknowledgement', { From: 'a@b.co', Subject: 'Thank you for your enquiry' }],
    ['mailing list', { From: 'a@b.co', Subject: 'Weekly digest', 'List-Id': '<news.b.co>' }],
    ['bulk precedence', { From: 'a@b.co', Subject: 'Newsletter', Precedence: 'bulk' }],
  ])('catches: %s', (_label, headers) => {
    expect(isAutomatedReply(H(headers))).toBe(true);
  });

  it.each([
    ['a genuine reply', { From: 'dave@b.co', Subject: 'Re: Thoughts on Duran Roofing' }],
    ['a keen one', { From: 'dave@b.co', Subject: 'Re: proposal — can we talk Friday?' }],
    ['Auto-Submitted: no', { From: 'dave@b.co', Subject: 'Re: quote', 'Auto-Submitted': 'no' }],
    ['merely mentioning the office', { From: 'dave@b.co', Subject: 'Can you come to the office Tuesday?' }],
    ['thanks mid-sentence', { From: 'dave@b.co', Subject: 'Thank you for your email — one question on pricing' }],
  ])('does not catch: %s', (_label, headers) => {
    expect(isAutomatedReply(H(headers))).toBe(false);
  });
});
