// Branded template catalog for the admin "Compose Email" tool — every option
// here renders through the same renderShell() header/footer as every other
// Bothmade email, so whatever Evan or Kiana sends looks consistent with the
// rest of the brand, not a plain-text scrawl.

export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url' | 'datetime-local';
  placeholder?: string;
  required?: boolean;
  // Shown under the field to explain why it matters and how to fill it in
  // well — used for fields where the quality of what's typed matters more
  // than the wording of the rest of the email (e.g. a personalized
  // observation in a cold email).
  helpText?: string;
  examples?: string[];
}

export interface BuiltEmail {
  subject: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
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
  fields: TemplateField[];
  build: (ctx: TemplateContext) => BuiltEmail;
}

// Every template gets this too — a Loom link, if one's attached, always
// renders the same way regardless of which template it's attached to.
const LOOM_FIELD: TemplateField = {
  key: 'loomUrl',
  label: 'Loom video link (optional)',
  type: 'url',
  placeholder: 'https://www.loom.com/share/...',
};

function withLoom(bodyHtml: string, loomUrl?: string): string {
  if (!loomUrl) return bodyHtml;
  return `
    ${bodyHtml}
    <div style="margin-top:20px; padding:14px 18px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px;">
      <p style="margin:0 0 8px 0; font-size:13px; color:rgba(255,255,255,0.5);">A short video walkthrough:</p>
      <a href="${loomUrl}" style="color:#7dd3fc; font-size:14px; font-weight:600; text-decoration:none;">${loomUrl}</a>
    </div>
  `;
}

function greeting(name: string): string {
  return name && name.trim() ? name.trim() : 'there';
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'custom',
    label: 'Custom message',
    description: 'Write your own — still gets the full branded header, footer, and optional button.',
    audience: 'both',
    fields: [
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'body', label: 'Message', type: 'textarea', required: true, placeholder: "Write what you'd like to say..." },
      { key: 'ctaLabel', label: 'Button text (optional)', type: 'text', placeholder: 'e.g. View proposal' },
      { key: 'ctaUrl', label: 'Button link (optional)', type: 'url' },
      LOOM_FIELD,
    ],
    build: ({ recipientName, fields }) => ({
      subject: fields.subject || 'A message from Bothmade',
      title: fields.subject || 'A message from Bothmade',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>` +
          fields.body
            .split('\n\n')
            .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
            .join(''),
        fields.loomUrl
      ),
      ctaLabel: fields.ctaLabel || undefined,
      ctaUrl: fields.ctaUrl || undefined,
    }),
  },

  // ── Outreach & follow-up sequence (sales) ────────────────────────────
  // One core cold email is the default for a reason: consistency is what
  // lets you actually measure what's working, instead of every send being
  // a unique variable. Reach for the "researched" variant only when you've
  // genuinely dug into a specific lead. Either way, the observation field
  // below matters more than any other wording in the email — don't send
  // until it's genuinely true and specific to this business.
  {
    id: 'cold_outreach',
    label: 'Cold outreach (default)',
    description: "The standard first-contact email. Don't send until the observation field is genuinely personalized.",
    audience: 'sales',
    fields: [
      {
        key: 'observation',
        label: 'One personalized observation (this matters more than anything else in the email)',
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
      { key: 'schedulingLink', label: 'Scheduling link (optional)', type: 'url' },
    ],
    build: ({ recipientName, company, senderName, fields }) => {
      const first = senderName ? senderName.split(' ')[0] : 'Evan';
      const title = fields.senderTitle || 'Director of Sales';
      return {
        subject: `Thoughts on ${company}'s website`,
        eyebrow: 'Cold outreach',
        title: 'Something worth flagging',
        bodyHtml:
          `<p>Hi ${greeting(recipientName)},</p>` +
          `<p>I'm ${first}, ${title} at Bothmade Studio.</p>` +
          `<p>I came across ${company} while researching businesses in your industry and spent some time looking through your website.</p>` +
          `<p style="color:#fff; font-weight:600;">One thing stood out to me: ${fields.observation}</p>` +
          `<p>Rather than sending a generic sales email, we'd like to earn the opportunity to work with you by creating a bespoke homepage concept for your business.</p>` +
          `<p>We'll research your company, your customers and your competitors, then walk you through our thinking on a short call. There's no obligation — we simply believe it's the best way to demonstrate how we work.</p>` +
          `<p>If you like the direction, we can discuss taking it further. If not, you'll still leave with ideas you can use.</p>` +
          `<p>Would you be open to a quick 15-minute conversation next week?</p>` +
          `<p>Kind regards,<br/>${first}<br/>${title}<br/>Bothmade Studio</p>`,
        ctaLabel: fields.schedulingLink ? 'Book a 15-minute call' : undefined,
        ctaUrl: fields.schedulingLink || undefined,
      };
    },
  },
  {
    id: 'cold_outreach_researched',
    label: 'Cold outreach (deeply researched)',
    description: 'For leads you\'ve dug into specifically — references what you\'ve already found, not just a general observation.',
    audience: 'sales',
    fields: [
      {
        key: 'observation',
        label: 'One personalized observation (this matters more than anything else in the email)',
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
      { key: 'callDays', label: 'Days to propose (optional)', type: 'text', placeholder: 'e.g. Tuesday or Wednesday' },
      { key: 'schedulingLink', label: 'Scheduling link (optional)', type: 'url' },
    ],
    build: ({ recipientName, company, senderName, fields }) => {
      const first = senderName ? senderName.split(' ')[0] : 'Evan';
      const title = fields.senderTitle || 'Director of Sales';
      return {
        subject: `Thoughts on ${company}'s website`,
        eyebrow: 'Cold outreach',
        title: 'Something worth flagging',
        bodyHtml:
          `<p>Hi ${greeting(recipientName)},</p>` +
          `<p>I'm ${first}, ${title} at Bothmade Studio.</p>` +
          `<p>I've spent some time looking into ${company}, your website and how you're positioned online.</p>` +
          `<p style="color:#fff; font-weight:600;">It struck me that ${fields.observation}</p>` +
          `<p>We've already identified several opportunities that could make a meaningful difference, and rather than trying to explain them over email, we'd like to build a bespoke homepage concept and walk you through the thinking behind it.</p>` +
          `<p>No templates. No obligation. Just a genuine demonstration of how we'd approach your business if we were fortunate enough to work together.</p>` +
          `<p>If it isn't for you, that's absolutely fine. At the very least, you'll leave with ideas you can use.</p>` +
          `<p>Would ${fields.callDays || 'next week'} work for a brief 15-minute conversation?</p>` +
          `<p>Kind regards,<br/>${first}<br/>${title}<br/>Bothmade Studio</p>`,
        ctaLabel: fields.schedulingLink ? 'Book a 15-minute call' : undefined,
        ctaUrl: fields.schedulingLink || undefined,
      };
    },
  },
  {
    id: 'followup_1',
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
        `<p>Wanted to circle back on my last note about ${company}'s site — know inboxes get busy, so no worries if this got buried.</p>` +
        `<p>Happy to answer anything about scope or pricing whenever it's useful, or just send a couple of relevant examples if that's easier.</p>`,
    }),
  },
  {
    id: 'followup_2',
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
      ctaLabel: fields.loomUrl ? 'Watch the walkthrough' : undefined,
      ctaUrl: fields.loomUrl,
    }),
  },
  {
    id: 'followup_3',
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
          ? `<p>For your project, that could look like <strong style="color:#fff;">${fields.lighterOption}</strong>, with room to expand later.</p>`
          : '') +
        `<p>Want me to put together that lighter-weight version so you can compare it directly?</p>`,
    }),
  },
  {
    id: 'objection_thinking',
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
        `<p>I can hold this scope and price for ${fields.holdWindow || 'the next week or so'} — after that I'd need to re-quote, since the schedule fills up fast.</p>` +
        `<p>No pressure either way — just didn't want the timing to catch you off guard. Let me know if you'd like to move ahead.</p>`,
    }),
  },

  // ── Scheduling & meetings (both) ─────────────────────────────────────
  {
    id: 'schedule_call',
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
         <p>I'd love to grab a quick call about ${fields.purpose}.</p>
         <p style="color:rgba(255,255,255,0.6);">${fields.proposedTimes.replace(/\n/g, '<br/>')}</p>
         <p>Let me know what works, or just grab a slot below.</p>`,
        fields.loomUrl
      ),
      ctaLabel: fields.schedulingLink ? 'Pick a time' : undefined,
      ctaUrl: fields.schedulingLink || undefined,
    }),
  },
  {
    id: 'meeting_confirmed',
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
         <p>Confirming our call for <strong style="color:#fff;">${fields.meetingDateTime}</strong>.</p>
         ${fields.agenda ? `<div style="background:rgba(255,255,255,0.05); border-left:3px solid #38bdf8; border-radius:8px; padding:14px 16px; margin:16px 0;"><p style="margin:0 0 6px 0; font-weight:700; color:#fff; font-size:13px;">On the agenda</p><p style="margin:0; color:rgba(255,255,255,0.7);">${fields.agenda.replace(/\n/g, '<br/>')}</p></div>` : ''}
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
    label: 'Requirements document request',
    description: 'Ask a client to fill out project requirements/onboarding details.',
    audience: 'ops',
    fields: [
      { key: 'onboardingLink', label: 'Form / dashboard link', type: 'url', required: true },
      { key: 'deadline', label: 'Deadline (optional)', type: 'text', placeholder: 'e.g. by end of week' },
      LOOM_FIELD,
    ],
    build: ({ recipientName, company, fields }) => ({
      subject: `${company}: a few details to kick things off`,
      eyebrow: 'Requirements needed',
      title: 'Let’s get your project details',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>
         <p>To get ${company}'s project moving, we just need a bit more detail from your side — a short form covering the essentials.</p>
         ${fields.deadline ? `<p style="font-size:13px; color:rgba(255,255,255,0.5);">If you can get this to us ${fields.deadline}, we can keep things on schedule.</p>` : ''}`,
        fields.loomUrl
      ),
      ctaLabel: 'Fill out requirements',
      ctaUrl: fields.onboardingLink,
    }),
  },
  {
    id: 'proposal_followup',
    label: 'Proposal follow-up',
    description: 'Nudge a lead to review and sign their proposal.',
    audience: 'sales',
    fields: [
      { key: 'signUrl', label: 'Sign & pay link', type: 'url', required: true },
      { key: 'note', label: 'Personal note (optional)', type: 'textarea' },
      LOOM_FIELD,
    ],
    build: ({ recipientName, company, fields }) => ({
      subject: `Checking in on ${company}'s proposal`,
      eyebrow: 'Next step',
      title: 'Still good to move forward?',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>
         <p>Wanted to check in on the proposal for ${company}. ${fields.note ? fields.note.replace(/\n/g, '<br/>') : "Happy to answer any questions before you sign off."}</p>`,
        fields.loomUrl
      ),
      ctaLabel: 'Review & sign',
      ctaUrl: fields.signUrl,
    }),
  },
  {
    id: 'contract_reminder',
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
         <p>Just a reminder that ${company}'s project agreement is ready and waiting for your review whenever you get a chance.</p>`,
        fields.loomUrl
      ),
      ctaLabel: 'Review & sign',
      ctaUrl: fields.signUrl,
    }),
  },
  {
    id: 'project_status_update',
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
      bodyHtml: `<p>Hi ${greeting(recipientName)},</p><p>There's a new update on <strong style="color:#fff;">${company}</strong>.</p>
        <div style="background:rgba(255,255,255,0.05); border-left:3px solid #38bdf8; border-radius:8px; padding:16px 18px; margin:20px 0;">
          <p style="margin:0 0 6px 0; font-weight:700; color:#fff;">${fields.updateTitle}</p>
          <p style="margin:0; color:rgba(255,255,255,0.7);">${fields.updateDetail.replace(/\n/g, '<br/>')}</p>
        </div>`,
      ctaLabel: fields.dashboardUrl ? 'View in dashboard' : undefined,
      ctaUrl: fields.dashboardUrl || undefined,
    }),
  },
  {
    id: 'project_completed',
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
        `<p><strong style="color:#fff;">${company}</strong> is officially live. It's been a pleasure building this with you, and we hope it makes a real difference for the business.</p>` +
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
        `<p>Hi ${greeting(recipientName)},</p>` +
          fields.message
            .split('\n\n')
            .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
            .join(''),
        fields.loomUrl
      ),
    }),
  },
];

export function getTemplate(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id);
}
