// Branded template catalog for the admin "Compose Email" tool — every option
// here renders through the same renderShell() header/footer as every other
// Bothmade email, so whatever Evan or Kiana sends looks consistent with the
// rest of the brand, not a plain-text scrawl.

import { renderAttachments, type AttachmentKind } from '@/lib/email-attachments';
import { esc, escMultiline, escParagraphs, normalizeUrl } from '@/lib/html';

export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url' | 'datetime-local' | 'select';
  placeholder?: string;
  required?: boolean;
  // Shown under the field to explain why it matters and how to fill it in
  // well — used for fields where the quality of what's typed matters more
  // than the wording of the rest of the email (e.g. a personalized
  // observation in a cold email).
  helpText?: string;
  /**
   * Neutral guidance, shown quietly under the field. `helpText` is amber and
   * meant to give someone pause; this is just an explanation, and it exists
   * so a label can be two words instead of a sentence that wraps.
   */
  hint?: string;
  examples?: string[];
  // For type: 'select' — a fixed set of on-brand options. Include a
  // '__custom__' value with a friendly label to let the field fall back to
  // free text when nothing preset fits.
  options?: Array<{ value: string; label: string }>;
}

// Preset headlines for the custom template — kept separate from the subject
// line on purpose: the subject is what shows in the inbox and should vary
// email to email, but the big headline inside the email body reads more
// professional when it's pulled from a short, consistent, on-brand set
// instead of restating (or clashing with) the subject line verbatim.
export const CUSTOM_HEADLINE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'A note from Bothmade', label: 'A note from Bothmade' },
  { value: 'Following up', label: 'Following up' },
  { value: 'Quick update', label: 'Quick update' },
  { value: 'Thought you’d want to see this', label: 'Thought you’d want to see this' },
  { value: 'Checking in', label: 'Checking in' },
  { value: 'One more thing', label: 'One more thing' },
  { value: '__custom__', label: 'Custom headline…' },
];

export interface BuiltEmail {
  subject: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  /**
   * The sign-off, separate from the body so the shell can put it last. Any
   * template can now carry attachments and a button, and both of those belong
   * above "Best, Evan" rather than trailing after it.
   */
  signOffHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface TemplateContext {
  recipientName: string;
  company: string;
  senderName: string;
  fields: Record<string, string>;
}

export interface EmailTemplate {
  id: string;
  label: string;
  description: string;
  audience: 'sales' | 'ops' | 'both';
  /** Heading this sits under in the template picker. */
  group: string;
  fields: TemplateField[];
  /**
   * Attachment rows the composer lays out the moment this template is
   * picked, labelled and captioned, with the links left blank to paste into.
   *
   * A send goes wrong when somebody forgets the second file, not when they
   * mislabel the first — so the rows exist before anyone remembers them, and
   * an empty one simply doesn't send.
   */
  starterAttachments?: Array<{ kind: AttachmentKind; label: string; note?: string }>;
  build: (ctx: TemplateContext) => BuiltEmail;
}

// Every template gets this too — a Loom link, if one's attached, always
// renders the same way regardless of which template it's attached to.
const LOOM_FIELD: TemplateField = {
  key: 'loomUrl',
  label: 'Loom video link',
  type: 'url',
  placeholder: 'https://www.loom.com/share/...',
  hint: 'Renders as its own button under the message.',
};

// Everything a `build()` interpolates into `bodyHtml` is escaped, because
// all of it is typed by a person: a rep filling in the composer, or a
// company/contact name imported from a research CSV. `subject`, `title`,
// `eyebrow`, `ctaLabel`, and `ctaUrl` are deliberately left raw here —
// renderShell() escapes those and runs ctaUrl through safeUrl(), and
// escaping twice would put &amp; in front of the client.
function withLoom(bodyHtml: string, loomUrl?: string): string {
  const url = normalizeUrl(loomUrl);
  if (!url) return bodyHtml;
  // Rendered through the same card as any other attachment, rather than as a
  // raw URL printed into the body — a client shouldn't have to work out that
  // the wall of text ending in `?sid=…` is the thing they're meant to click.
  return (
    bodyHtml +
    renderAttachments(
      [{ kind: 'link', label: 'Watch the walkthrough', url, note: 'Short video — no sign-in needed' }],
      'Video walkthrough'
    )
  );
}

/** Escaped — this always lands in bodyHtml, never in a header. */
function greeting(name: string): string {
  return name && name.trim() ? esc(name.trim()) : 'there';
}

/**
 * The sign-off block, ruled off from whatever came before it. One shape for
 * every template that signs a message, so the spacing and the weight don't
 * drift email to email.
 */
function signOff(opts: { closing?: string; name: string; title?: string }): string {
  const lines = [
    `<strong style="color:#fff;">${esc(opts.name)}</strong>`,
    opts.title ? `<span style="color:rgba(255,255,255,0.5); font-size:13px;">${esc(opts.title)}</span>` : '',
    `<span style="color:rgba(255,255,255,0.5); font-size:13px;">Bothmade Studio</span>`,
  ].filter(Boolean);

  return `<p style="margin:28px 0 0 0; padding-top:22px; border-top:1px solid rgba(255,255,255,0.08);">${esc(
    opts.closing || 'Best,'
  )}<br/>${lines.join('<br/>')}</p>`;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'custom',
    group: 'Write your own',
    label: 'Custom message',
    description: 'Write your own — still gets the full branded header, footer, and optional button.',
    audience: 'both',
    fields: [
      {
        key: 'headline',
        label: 'Headline',
        type: 'select',
        required: true,
        hint: 'The big line inside the email — deliberately not the same as the subject.',
        options: CUSTOM_HEADLINE_OPTIONS,
      },
      {
        key: 'headlineCustom',
        label: 'Custom headline',
        type: 'text',
        placeholder: 'e.g. Something worth flagging',
      },
      { key: 'subject', label: 'Subject line', type: 'text', required: true, hint: 'What they see in their inbox.' },
      { key: 'body', label: 'Message', type: 'textarea', required: true, placeholder: "Write what you'd like to say..." },
      { key: 'senderTitle', label: 'Your title', type: 'text', placeholder: 'e.g. Director of Sales', hint: 'Shown in the sign-off.' },
      { key: 'ctaLabel', label: 'Main button text', type: 'text', placeholder: 'e.g. View proposal' },
      { key: 'ctaUrl', label: 'Main button link', type: 'url', hint: 'The one big button under the message. Attachments get their own.' },
      LOOM_FIELD,
    ],
    build: ({ recipientName, senderName, fields }) => {
      const headline = fields.headline === '__custom__' ? fields.headlineCustom || 'A note from Bothmade' : fields.headline || 'A note from Bothmade';
      const full = senderName || 'The Bothmade Team';
      return {
        subject: fields.subject || headline,
        title: headline,
        bodyHtml: withLoom(
          `<p>Hi ${greeting(recipientName)},</p>` + escParagraphs(fields.body),
          fields.loomUrl
        ),
        signOffHtml: signOff({ name: full, title: fields.senderTitle }),
        ctaLabel: fields.ctaLabel || undefined,
        ctaUrl: fields.ctaUrl || undefined,
      };
    },
  },

  // ── Outreach & follow-up sequence (sales) ────────────────────────────
  // One core cold email is the default for a reason: consistency is what
  // lets you actually measure what's working, instead of every send being
  // a unique variable. Reach for the "researched" variant only when you've
  // genuinely dug into a specific lead. Either way, the observation field
  // below matters more than any other wording in the email — don't send
  // until it's genuinely true and specific to this business.
  {
    id: 'concept_delivery',
    group: 'Concept delivery',
    label: 'Concept + brochure (video attached)',
    description:
      'Sends the finished concept as a video and a brochure. Nothing links to a live site — the concept is built, not published.',
    audience: 'sales',
    fields: [
      {
        key: 'observation',
        label: 'What you noticed about their site',
        type: 'textarea',
        required: true,
        placeholder:
          'e.g. two award-winning divisions and a homepage that asks people to choose between them before it says who you are',
        helpText:
          'One line, specific to them. It is the sentence that proves a person looked at this business rather than a template being filled in.',
        examples: [
          'Two award-winning divisions, thirty years in one valley, and a website that asks people to choose between them before it has told them who you are.',
          'A 4.9 from seventy-six reviews, sitting in a carousel most of the way down the page.',
        ],
      },
      {
        key: 'senderTitle',
        label: 'Your title',
        type: 'text',
        placeholder: 'e.g. Director of Sales',
      },
    ],
    // Three rows, laid out and captioned. Two of them are PDFs, because the
    // brochure and the full-size screens are separate files and forgetting
    // the second one is the easiest mistake in this send.
    starterAttachments: [
      { kind: 'link', label: 'Watch the walkthrough', note: 'About two minutes — no sign-in needed' },
      { kind: 'pdf', label: 'The brochure', note: 'The concept page by page, the three prices, every term explained' },
      { kind: 'pdf', label: 'The screens, full size', note: 'For showing someone who is not on this email' },
    ],
    build: ({ recipientName, company, senderName, fields }) => {
      const first = senderName ? senderName.split(' ')[0] : 'Evan';
      const full = senderName || 'Evan';
      const title = fields.senderTitle || 'Director of Sales';
      return {
        subject: `We built ${company} a homepage — here it is`,
        eyebrow: 'A concept, already built',
        title: 'We made the thing rather than describing it',
        bodyHtml:
          `<p>Hi ${greeting(recipientName)},</p>` +
          `<p>I'm ${esc(first)}, ${esc(title)} at Bothmade Studio. Rather than send you a pitch, we built ${esc(
            company
          )} a homepage and recorded a walkthrough of it. Both are attached.</p>` +
          // Omitted entirely when there's nothing to say, rather than
          // printed as a heading with a blank under it — which is what the
          // preview showed the first time this template was used.
          (fields.observation?.trim()
            ? `<p style="color:#fff; font-weight:600;">What prompted it: ${escMultiline(fields.observation)}</p>`
            : '') +
          `<p>It is finished and it runs. It is not published anywhere — the video is how you see it move, and the brochure walks through what each part of it does and what it would cost, in three versions.</p>` +
          `<p>It is one idea, not the only one. Every piece of it is yours to change, and none of it costs you anything to look at. If you like the direction we can talk about taking it further; if you don't, you keep the ideas.</p>` +
          `<p>Worth fifteen minutes next week?</p>`,
        signOffHtml: signOff({ closing: 'Kind regards,', name: full, title }),
      };
    },
  },
  {
    id: 'cold_outreach',
    group: 'Outreach',
    label: 'Cold outreach (default)',
    description: "The standard first-contact email. Don't send until the observation field is genuinely personalized.",
    audience: 'sales',
    fields: [
      {
        key: 'observation',
        label: 'One personalized observation',
        type: 'textarea',
        required: true,
        placeholder: 'e.g. the quality of your work and customer reviews deserve a website that builds the same confidence online as you already do in person',
        helpText:
          "Don't send this until you can genuinely fill this in — it's what separates a real email from a template blast.",
        examples: [
          "I noticed you've been serving Birmingham for over 35 years, but your recent commercial projects are almost impossible to find on the website.",
          "Your Google reviews are exceptional, but they're barely visible on the homepage.",
        ],
      },
      { key: 'senderTitle', label: 'Your title', type: 'text', placeholder: 'e.g. Director of Sales' },
    ],
    build: ({ recipientName, company, senderName, fields }) => {
      const first = senderName ? senderName.split(' ')[0] : 'Evan';
      const full = senderName || 'Evan';
      const title = fields.senderTitle || 'Director of Sales';
      return {
        subject: `Thoughts on ${company}'s website`,
        eyebrow: 'Cold outreach',
        title: 'Something worth flagging',
        bodyHtml:
          `<p>Hi ${greeting(recipientName)},</p>` +
          `<p>I'm ${esc(first)}, ${esc(title)} at Bothmade Studio.</p>` +
          `<p>I came across ${esc(company)} while researching businesses in your industry and spent some time looking through your website.</p>` +
          `<p style="color:#fff; font-weight:600;">One thing stood out to me: ${escMultiline(fields.observation)}</p>` +
          `<p>Rather than sending a generic sales email, we'd like to earn the opportunity to work with you by creating a bespoke homepage concept for your business.</p>` +
          `<p>We'll research your company, your customers and your competitors, then walk you through our thinking on a short call. There's no obligation — we simply believe it's the best way to demonstrate how we work.</p>` +
          `<p>If you like the direction, we can discuss taking it further. If not, you'll still leave with ideas you can use.</p>` +
          `<p>Would you be open to a quick 15-minute conversation next week?</p>`,
        signOffHtml: signOff({ closing: 'Kind regards,', name: full, title }),
      };
    },
  },
  {
    id: 'cold_outreach_researched',
    group: 'Outreach',
    label: 'Cold outreach (deeply researched)',
    description: 'For leads you\'ve dug into specifically — references what you\'ve already found, not just a general observation.',
    audience: 'sales',
    fields: [
      {
        key: 'observation',
        label: 'One personalized observation',
        type: 'textarea',
        required: true,
        placeholder: 'e.g. your business has clearly earned a strong reputation, but your website doesn\'t communicate that same level of quality to a first-time visitor',
        helpText:
          "Don't send this until you can genuinely fill this in — it's what separates a real email from a template blast.",
        examples: [
          "I noticed you've been serving Birmingham for over 35 years, but your recent commercial projects are almost impossible to find on the website.",
          "Your Google reviews are exceptional, but they're barely visible on the homepage.",
        ],
      },
      { key: 'senderTitle', label: 'Your title', type: 'text', placeholder: 'e.g. Director of Sales' },
      { key: 'callDays', label: 'Days to propose', type: 'text', placeholder: 'e.g. Tuesday or Wednesday' },
    ],
    build: ({ recipientName, company, senderName, fields }) => {
      const first = senderName ? senderName.split(' ')[0] : 'Evan';
      const full = senderName || 'Evan';
      const title = fields.senderTitle || 'Director of Sales';
      return {
        subject: `Thoughts on ${company}'s website`,
        eyebrow: 'Cold outreach',
        title: 'Something worth flagging',
        bodyHtml:
          `<p>Hi ${greeting(recipientName)},</p>` +
          `<p>I'm ${esc(first)}, ${esc(title)} at Bothmade Studio.</p>` +
          `<p>I've spent some time looking into ${esc(company)}, your website and how you're positioned online.</p>` +
          `<p style="color:#fff; font-weight:600;">It struck me that ${escMultiline(fields.observation)}</p>` +
          `<p>We've already identified several opportunities that could make a meaningful difference, and rather than trying to explain them over email, we'd like to build a bespoke homepage concept and walk you through the thinking behind it.</p>` +
          `<p>No templates. No obligation. Just a genuine demonstration of how we'd approach your business if we were fortunate enough to work together.</p>` +
          `<p>If it isn't for you, that's absolutely fine. At the very least, you'll leave with ideas you can use.</p>` +
          `<p>Would ${esc(fields.callDays) || 'next week'} work for a brief 15-minute conversation?</p>`,
        signOffHtml: signOff({ closing: 'Kind regards,', name: full, title }),
      };
    },
  },
  {
    id: 'followup_1',
    group: 'Follow-up',
    label: 'Follow-up #1 (no response)',
    description: 'First nudge after initial outreach goes unanswered.',
    audience: 'sales',
    fields: [],
    build: ({ recipientName, company }) => ({
      subject: 'Following up',
      eyebrow: 'Follow-up',
      title: `Circling back on ${company}`,
      bodyHtml:
        `<p>Hi ${greeting(recipientName)},</p>` +
        `<p>Wanted to circle back on my last note about ${esc(company)}'s site — know inboxes get busy, so no worries if this got buried.</p>` +
        `<p>Happy to answer anything about scope or pricing whenever it's useful, or just send a couple of relevant examples if that's easier.</p>`,
    }),
  },
  {
    id: 'followup_2',
    group: 'Follow-up',
    label: 'Follow-up #2 (re-engagement)',
    description: 'Second touch after continued silence — good spot to attach a Loom walkthrough.',
    audience: 'sales',
    fields: [LOOM_FIELD],
    build: ({ recipientName, fields }) => ({
      subject: 'Still worth a look?',
      eyebrow: 'Follow-up',
      title: 'Checking back in',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>` +
          `<p>Haven't heard back, so this is just a check-in — if timing isn't right, that's completely fine, and I'll leave it in your hands.</p>` +
          `<p>${fields.loomUrl ? 'Put together a short video with a couple of specific ideas — take a look whenever it suits.' : "Happy to pick this back up whenever it's a better time on your end."}</p>`,
        fields.loomUrl
      ),
      // No CTA here on purpose — withLoom() already renders the video as its
      // own button, and two buttons to the same place reads as a mistake.
    }),
  },
  {
    id: 'followup_3',
    group: 'Follow-up',
    label: 'Follow-up #3 (final)',
    description: 'Last touch in the sequence before closing the lead out.',
    audience: 'sales',
    fields: [],
    build: ({ recipientName }) => ({
      subject: 'One last check-in',
      eyebrow: 'Final follow-up',
      title: "I'll close this out for now",
      bodyHtml:
        `<p>Hi ${greeting(recipientName)},</p>` +
        `<p>Don't want to keep cluttering your inbox, so I'll leave it here for now and won't follow up again unless I hear from you.</p>` +
        `<p>If anything changes down the line, feel free to reply any time — happy to pick things back up whenever it makes sense.</p>`,
    }),
  },

  // ── Objection handling (sales) ───────────────────────────────────────
  {
    id: 'objection_price',
    group: 'Objections',
    label: 'Objection: price',
    description: 'Response when a lead pushes back on cost.',
    audience: 'sales',
    fields: [{ key: 'lighterOption', label: 'Lighter-scope option to propose', type: 'text', placeholder: 'e.g. base Website without add-ons, $3,000' }],
    build: ({ recipientName, fields }) => ({
      subject: 'Re: pricing',
      eyebrow: 'On budget',
      title: "Let's find a scope that fits",
      bodyHtml:
        `<p>Hi ${greeting(recipientName)},</p>` +
        `<p>Appreciate you being upfront about it. A lot of clients start with a smaller core version and layer on features later once the return proves out, rather than committing to everything at once.</p>` +
        (fields.lighterOption
          ? `<p>For your project, that could look like <strong style="color:#fff;">${esc(fields.lighterOption)}</strong>, with room to expand later.</p>`
          : '') +
        `<p>Want me to put together that lighter-weight version so you can compare it directly?</p>`,
    }),
  },
  {
    id: 'objection_thinking',
    group: 'Objections',
    label: 'Objection: "need to think"',
    description: 'Response when a lead wants time before deciding.',
    audience: 'sales',
    fields: [],
    build: ({ recipientName }) => ({
      subject: 'Take your time',
      eyebrow: 'No pressure',
      title: 'Whatever pace works for you',
      bodyHtml:
        `<p>Hi ${greeting(recipientName)},</p>` +
        `<p>Take whatever time you need — this isn't a decision to rush.</p>` +
        `<p>If it's useful, I'm glad to dig into whichever piece you're weighing most — timeline, price, or scope — so you've got a clear answer rather than a generic pitch to sit with.</p>`,
    }),
  },
  {
    id: 'objection_comparing',
    group: 'Objections',
    label: 'Objection: comparing agencies',
    description: 'Response when a lead is shopping other studios.',
    audience: 'sales',
    fields: [],
    build: ({ recipientName }) => ({
      subject: 'Re: comparing options',
      eyebrow: 'Worth comparing',
      title: "One thing worth weighing",
      bodyHtml:
        `<p>Hi ${greeting(recipientName)},</p>` +
        `<p>Smart to shop around — it's a real investment. One thing worth asking whoever else is in the mix: what happens after launch? A lot of studios move on the moment the invoice clears.</p>` +
        `<p>Every Bothmade project includes a Warranty Period after launch, plus optional ongoing care plans, so you're covered if something needs attention down the line. Happy to answer anything specific you're weighing.</p>`,
    }),
  },
  {
    id: 'objection_timeline',
    group: 'Objections',
    label: 'Objection: timeline too long',
    description: 'Response when a lead is concerned about how long the project will take.',
    audience: 'sales',
    fields: [],
    build: ({ recipientName }) => ({
      subject: 'Re: timeline',
      eyebrow: 'On scheduling',
      title: 'A couple of ways to move faster',
      bodyHtml:
        `<p>Hi ${greeting(recipientName)},</p>` +
        `<p>Understood — a firm deadline changes the calculus. Two options: a Rush timeline for an added fee, or narrowing the initial scope to launch faster and treat the rest as a follow-on phase once the core is live.</p>` +
        `<p>Want me to price out either path so you can compare?</p>`,
    }),
  },

  // ── Closing (sales) ──────────────────────────────────────────────────
  {
    id: 'closing_payment_sent',
    group: 'Closing',
    label: 'Closing: payment link sent',
    description: 'Sent right after a payment link goes out, to set expectations on next steps.',
    audience: 'sales',
    fields: [],
    build: ({ recipientName, company }) => ({
      subject: "You're all set to get started",
      eyebrow: 'Getting started',
      title: `Excited to kick off ${company}`,
      bodyHtml:
        `<p>Hi ${greeting(recipientName)},</p>` +
        `<p>Sent the payment link your way — once the deposit clears, we'll kick off Discovery within the next few business days.</p>` +
        `<p>Looking forward to getting started on this one.</p>`,
    }),
  },
  {
    id: 'closing_scarcity',
    group: 'Closing',
    label: 'Closing: holding the quote',
    description: 'A time-bound nudge toward a decision, without being pushy.',
    audience: 'sales',
    fields: [{ key: 'holdWindow', label: 'How long you can hold the quote', type: 'text', placeholder: 'e.g. the next week' }],
    build: ({ recipientName, fields }) => ({
      subject: 'Holding your quote',
      eyebrow: 'Just so you know',
      title: 'A quick heads-up on timing',
      bodyHtml:
        `<p>Hi ${greeting(recipientName)},</p>` +
        `<p>I can hold this scope and price for ${esc(fields.holdWindow) || 'the next week or so'} — after that I'd need to re-quote, since the schedule fills up fast.</p>` +
        `<p>No pressure either way — just didn't want the timing to catch you off guard. Let me know if you'd like to move ahead.</p>`,
    }),
  },

  // ── Scheduling & meetings (both) ─────────────────────────────────────
  {
    id: 'schedule_call',
    group: 'Scheduling',
    label: 'Schedule a call',
    description: 'Propose a time to talk — for outreach or a next-step follow-up.',
    audience: 'sales',
    fields: [
      { key: 'purpose', label: 'What the call is about', type: 'text', required: true, placeholder: 'e.g. walking through your project scope' },
      { key: 'proposedTimes', label: 'Times that work for you', type: 'textarea', required: true, placeholder: 'e.g. Tue/Wed afternoon, or any time Thursday' },
      { key: 'schedulingLink', label: 'Scheduling link (Calendly, etc.)', type: 'url' },
      LOOM_FIELD,
    ],
    build: ({ recipientName, fields }) => ({
      subject: `Quick call — ${fields.purpose}?`,
      eyebrow: 'Let’s talk',
      title: 'Got 15 minutes?',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>
         <p>I'd love to grab a quick call about ${esc(fields.purpose)}.</p>
         <p style="color:rgba(255,255,255,0.6);">${escMultiline(fields.proposedTimes)}</p>
         <p>Let me know what works, or just grab a slot below.</p>`,
        fields.loomUrl
      ),
      ctaLabel: fields.schedulingLink ? 'Pick a time' : undefined,
      ctaUrl: fields.schedulingLink || undefined,
    }),
  },
  {
    id: 'meeting_confirmed',
    group: 'Scheduling',
    label: 'Meeting confirmation',
    description: 'Confirm a scheduled call with the date, link, and agenda.',
    audience: 'both',
    fields: [
      { key: 'meetingDateTime', label: 'Date & time', type: 'text', required: true, placeholder: 'e.g. Thursday, Aug 6 at 2:00pm ET' },
      { key: 'meetingLink', label: 'Meeting link (Zoom, Meet, etc.)', type: 'url' },
      { key: 'agenda', label: 'What we’ll cover', type: 'textarea' },
      LOOM_FIELD,
    ],
    build: ({ recipientName, fields }) => ({
      subject: `Confirmed: ${fields.meetingDateTime}`,
      eyebrow: 'Meeting confirmed',
      title: fields.meetingDateTime,
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>
         <p>Confirming our call for <strong style="color:#fff;">${esc(fields.meetingDateTime)}</strong>.</p>
         ${fields.agenda ? `<div style="background:rgba(255,255,255,0.05); border-left:3px solid #38bdf8; border-radius:8px; padding:14px 16px; margin:16px 0;"><p style="margin:0 0 6px 0; font-weight:700; color:#fff; font-size:13px;">On the agenda</p><p style="margin:0; color:rgba(255,255,255,0.7);">${escMultiline(fields.agenda)}</p></div>` : ''}
         <p>Talk soon.</p>`,
        fields.loomUrl
      ),
      ctaLabel: fields.meetingLink ? 'Join meeting' : undefined,
      ctaUrl: fields.meetingLink || undefined,
    }),
  },

  // ── Ops / delivery (Kiana's side) ────────────────────────────────────
  {
    id: 'requirements_request',
    group: 'Delivery',
    label: 'Requirements document request',
    description: 'Ask a client to fill out project requirements/onboarding details.',
    audience: 'ops',
    fields: [
      { key: 'onboardingLink', label: 'Form / dashboard link', type: 'url', required: true },
      { key: 'deadline', label: 'Deadline', type: 'text', placeholder: 'e.g. by end of week' },
      LOOM_FIELD,
    ],
    build: ({ recipientName, company, fields }) => ({
      subject: `${company}: a few details to kick things off`,
      eyebrow: 'Requirements needed',
      title: 'Let’s get your project details',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>
         <p>To get ${esc(company)}'s project moving, we just need a bit more detail from your side — a short form covering the essentials.</p>
         ${fields.deadline ? `<p style="font-size:13px; color:rgba(255,255,255,0.5);">If you can get this to us ${esc(fields.deadline)}, we can keep things on schedule.</p>` : ''}`,
        fields.loomUrl
      ),
      ctaLabel: 'Fill out requirements',
      ctaUrl: fields.onboardingLink,
    }),
  },
  {
    id: 'proposal_followup',
    group: 'Closing',
    label: 'Proposal follow-up',
    description: 'Nudge a lead to review and sign their proposal.',
    audience: 'sales',
    fields: [
      { key: 'signUrl', label: 'Sign & pay link', type: 'url', required: true },
      { key: 'note', label: 'Personal note', type: 'textarea' },
      LOOM_FIELD,
    ],
    build: ({ recipientName, company, fields }) => ({
      subject: `Checking in on ${company}'s proposal`,
      eyebrow: 'Next step',
      title: 'Still good to move forward?',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>
         <p>Wanted to check in on the proposal for ${esc(company)}. ${fields.note ? escMultiline(fields.note) : "Happy to answer any questions before you sign off."}</p>`,
        fields.loomUrl
      ),
      ctaLabel: 'Review & sign',
      ctaUrl: fields.signUrl,
    }),
  },
  {
    id: 'contract_reminder',
    group: 'Closing',
    label: 'Contract reminder',
    description: 'Remind a client their agreement is still awaiting signature.',
    audience: 'both',
    fields: [
      { key: 'signUrl', label: 'Sign & pay link', type: 'url', required: true },
      LOOM_FIELD,
    ],
    build: ({ recipientName, company, fields }) => ({
      subject: `Reminder: ${company}'s agreement is ready for signature`,
      eyebrow: 'Awaiting signature',
      title: 'Your agreement is ready',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>
         <p>Just a reminder that ${esc(company)}'s project agreement is ready and waiting for your review whenever you get a chance.</p>`,
        fields.loomUrl
      ),
      ctaLabel: 'Review & sign',
      ctaUrl: fields.signUrl,
    }),
  },
  {
    id: 'project_status_update',
    group: 'Delivery',
    label: 'Project status update',
    description: 'Update a client on progress mid-project.',
    audience: 'ops',
    fields: [
      { key: 'updateTitle', label: 'Update headline', type: 'text', required: true, placeholder: 'e.g. Design phase complete' },
      { key: 'updateDetail', label: 'Details', type: 'textarea', required: true },
      { key: 'dashboardUrl', label: 'Dashboard link', type: 'url' },
    ],
    build: ({ recipientName, company, fields }) => ({
      subject: `${company}: ${fields.updateTitle}`,
      eyebrow: 'Project update',
      title: company,
      bodyHtml: `<p>Hi ${greeting(recipientName)},</p><p>There's a new update on <strong style="color:#fff;">${esc(company)}</strong>.</p>
        <div style="background:rgba(255,255,255,0.05); border-left:3px solid #38bdf8; border-radius:8px; padding:16px 18px; margin:20px 0;">
          <p style="margin:0 0 6px 0; font-weight:700; color:#fff;">${esc(fields.updateTitle)}</p>
          <p style="margin:0; color:rgba(255,255,255,0.7);">${escMultiline(fields.updateDetail)}</p>
        </div>`,
      ctaLabel: fields.dashboardUrl ? 'View in dashboard' : undefined,
      ctaUrl: fields.dashboardUrl || undefined,
    }),
  },
  {
    id: 'project_completed',
    group: 'Delivery',
    label: 'Project completed / delivery',
    description: 'Sent when a project ships — includes warranty and care-plan follow-up.',
    audience: 'ops',
    fields: [{ key: 'dashboardUrl', label: 'Dashboard / live site link', type: 'url', required: true }],
    build: ({ recipientName, company, fields }) => ({
      subject: `${company} is live`,
      eyebrow: 'Project complete',
      title: `${company} is live`,
      bodyHtml:
        `<p>Hi ${greeting(recipientName)},</p>` +
        `<p><strong style="color:#fff;">${esc(company)}</strong> is officially live. It's been a pleasure building this with you, and we hope it makes a real difference for the business.</p>` +
        `<div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:16px 18px; margin:20px 0; color:rgba(255,255,255,0.75); font-size:14px;">
           <p style="margin:0 0 6px 0;"><strong style="color:#fff;">What's next:</strong></p>
           <p style="margin:0 0 4px 0;">A 30-day Warranty Period is now active — anything that breaks, we fix at no charge.</p>
           <p style="margin:0 0 4px 0;">Full source files and admin access are in your dashboard.</p>
           <p style="margin:0;">If you'd like ongoing updates, content changes, or new features down the line, we offer monthly care plans — just reply and I'll send details.</p>
         </div>` +
        `<p>Thanks again for trusting us with this — and if you know anyone else who could use a hand, we'd love an introduction.</p>`,
      ctaLabel: 'View your live project',
      ctaUrl: fields.dashboardUrl,
    }),
  },
  {
    id: 'check_in',
    group: 'Delivery',
    label: 'Check-in',
    description: 'A general status/relationship check-in with no specific CTA.',
    audience: 'both',
    fields: [
      { key: 'message', label: 'Message', type: 'textarea', required: true },
      LOOM_FIELD,
    ],
    build: ({ recipientName, fields }) => ({
      subject: 'Checking in',
      title: 'Checking in',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>` + escParagraphs(fields.message),
        fields.loomUrl
      ),
    }),
  },
];

export function getTemplate(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id);
}
