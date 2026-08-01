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
      <p style="margin:0 0 8px 0; font-size:13px; color:rgba(255,255,255,0.5);">📹 A quick video walkthrough:</p>
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
         <p>Talk soon!</p>`,
        fields.loomUrl
      ),
      ctaLabel: fields.meetingLink ? 'Join meeting' : undefined,
      ctaUrl: fields.meetingLink || undefined,
    }),
  },
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
      subject: `Following up — ${company}'s proposal`,
      eyebrow: 'Just checking in',
      title: 'Still good to move forward?',
      bodyHtml: withLoom(
        `<p>Hi ${greeting(recipientName)},</p>
         <p>Wanted to check in on the proposal we put together for ${company}. ${fields.note ? fields.note.replace(/\n/g, '<br/>') : "Happy to answer any questions before you sign off."}</p>`,
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
         <p>Just a friendly reminder that ${company}'s project agreement is ready and waiting for your review.</p>`,
        fields.loomUrl
      ),
      ctaLabel: 'Review & sign',
      ctaUrl: fields.signUrl,
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
