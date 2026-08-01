// Canned snippets for the lead activity logger — common follow-up emails and
// objection responses so Evan isn't writing the same message from scratch
// every time. Selecting one inserts it into the activity content textarea,
// which he can then edit before logging (and optionally sending).

export interface SalesTemplate {
  label: string;
  category: 'follow-up' | 'objection' | 'closing';
  subject?: string;
  body: string;
}

export const SALES_TEMPLATES: SalesTemplate[] = [
  {
    label: 'First follow-up (no response)',
    category: 'follow-up',
    subject: 'Following up',
    body: "Hey — wanted to follow up on my last message. Still happy to answer any questions about scope or pricing whenever works for you. No pressure, just didn't want this to fall through the cracks.",
  },
  {
    label: 'Re-engagement (gone quiet)',
    category: 'follow-up',
    subject: 'Still interested?',
    body: "Hi — haven't heard back in a bit, so just checking in. If timing isn't right, totally understand — happy to pick this back up whenever it makes sense on your end. Let me know either way.",
  },
  {
    label: 'Sent proposal, awaiting decision',
    category: 'follow-up',
    subject: 'Checking in on the proposal',
    body: 'Wanted to check in on the proposal I sent over — happy to hop on a quick call if it would help to walk through any part of it, or adjust scope if something isn\'t quite right.',
  },
  {
    label: 'Objection: "Too expensive"',
    category: 'objection',
    body: "Totally fair — let's see if we can find a scope that fits your budget. A lot of clients start with a smaller core version and add features later as the ROI proves out, rather than everything at once. Want me to put together a lighter-weight option?",
  },
  {
    label: 'Objection: "Need to think about it"',
    category: 'objection',
    body: "Of course, take the time you need. Out of curiosity, is there a specific piece you're weighing — timeline, price, or scope? Happy to address anything directly so you've got what you need to decide.",
  },
  {
    label: 'Objection: "Comparing other agencies"',
    category: 'objection',
    body: "Makes sense — it's worth comparing. One thing that tends to matter most: what happens after launch. A lot of agencies disappear once the project ships; we build in a Warranty Period and offer ongoing plans so you're not stuck if something needs attention later. Happy to answer anything specific you're weighing.",
  },
  {
    label: 'Objection: "Timeline is too long"',
    category: 'objection',
    body: "Understood — we do offer a Rush timeline for an added fee if the deadline is firm. Alternatively, we could narrow the initial scope to hit a faster launch and treat the rest as a fast-follow phase. Want me to price out either option?",
  },
  {
    label: 'Closing: ready to send payment link',
    category: 'closing',
    body: 'Great — I\'ll get a secure payment link over to you now. Once the deposit is in, we\'ll kick off Discovery within the next few days.',
  },
  {
    label: 'Closing: nudge toward decision',
    category: 'closing',
    body: "Just so you have it — I can hold this scope and pricing for the next week. After that I'd need to re-quote given how our calendar is filling up. Let me know if you'd like to move forward.",
  },
];
