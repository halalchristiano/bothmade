'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Monitor, PenLine, Send, Smartphone } from 'lucide-react';
import { EMAIL_TEMPLATES, getTemplate } from '@/lib/email-templates';
import { describeUrlProblem } from '@/lib/html';
import {
  EmailAttachmentsEditor,
  attachmentProblems,
  attachmentsForSend,
  type AttachmentDraft,
} from './EmailAttachmentsEditor';
import {
  Avatar,
  Field,
  GhostButton,
  PrimaryButton,
  Section,
  SegmentedControl,
  SelectMenu,
  inputClasses,
} from './composer-ui';
import { Modal, ModalCloseButton } from './Modal';

/**
 * The one place any team member sends a branded, on-template email to a lead
 * or client — instead of everyone drafting their own emails by hand, this
 * fills in the same header/footer/CTA shell every transactional email uses,
 * and (if the sender connected Gmail in Settings) actually sends through
 * their own Gmail account so it lands in their real Sent folder. A live
 * preview renders the exact same HTML the send call would produce, so what
 * you see here is what the recipient actually gets — not an approximation.
 *
 * Laid out as a mail client rather than as a form: who it's going to, then
 * what it says, then what's attached, with the send controls pinned to the
 * bottom instead of stranded below a long scroll, and the preview framed as
 * a message rather than floating loose in the panel.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Fields that are safe to auto-fill because they're derived from data we
// already have on the lead/project, not guessed — the observation field is
// the one thing that's never safe to invent, so it only fills in when a
// real one-liner was researched and stored ahead of time.
function defaultsForTemplate(
  templateId: string,
  ctx: {
    leadId?: string;
    leadShareToken?: string | null;
    projectId?: string;
    defaultObservation?: string | null;
    defaultSenderTitle?: string | null;
  }
): Record<string, string> {
  const d: Record<string, string> = {};
  // The sign-and-pay link needs the lead's capability token — the ID alone
  // no longer opens the page, so a link built without it is a dead link.
  if ((templateId === 'proposal_followup' || templateId === 'contract_reminder') && ctx.leadId && ctx.leadShareToken) {
    d.signUrl = `${SITE_URL}/sign/${ctx.leadId}?t=${ctx.leadShareToken}`;
  }
  if (
    (templateId === 'project_status_update' || templateId === 'project_completed' || templateId === 'requirements_request') &&
    ctx.projectId
  ) {
    const url = `${SITE_URL}/client/${ctx.projectId}`;
    if (templateId === 'requirements_request') d.onboardingLink = url;
    else d.dashboardUrl = url;
  }
  if ((templateId === 'cold_outreach' || templateId === 'cold_outreach_researched') && ctx.defaultObservation) {
    d.observation = ctx.defaultObservation;
  }
  if (ctx.defaultSenderTitle) {
    d.senderTitle = ctx.defaultSenderTitle;
  }
  return d;
}

export const TEMPLATE_OPTIONS = EMAIL_TEMPLATES.map((t) => ({
  value: t.id,
  label: t.label,
  description: t.description,
  group: t.group,
}));

export function EmailComposer({
  recipientEmail,
  recipientName,
  company,
  defaultLoomUrl,
  defaultPainPoint,
  defaultObservation,
  leadId,
  leadShareToken,
  clientId,
  projectId,
  onClose,
  onSent,
}: {
  recipientEmail: string;
  recipientName?: string;
  company?: string;
  defaultLoomUrl?: string | null;
  defaultPainPoint?: string | null;
  defaultObservation?: string | null;
  leadId?: string;
  /** The lead's public-link capability token, so sign-and-pay URLs work. */
  leadShareToken?: string | null;
  clientId?: string;
  projectId?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const staticDefaultFields: Record<string, string> = {};
  if (defaultLoomUrl) staticDefaultFields.loomUrl = defaultLoomUrl;
  if (defaultPainPoint) staticDefaultFields.painPoint = defaultPainPoint;

  const [defaultSenderTitle, setDefaultSenderTitle] = useState<string | null>(null);

  const buildDefaultFields = (id: string) => {
    const selectDefaults: Record<string, string> = {};
    for (const f of getTemplate(id)?.fields || []) {
      if (f.type === 'select' && f.options?.[0]) selectDefaults[f.key] = f.options[0].value;
    }
    return {
      ...staticDefaultFields,
      ...selectDefaults,
      ...defaultsForTemplate(id, { leadId, leadShareToken, projectId, defaultObservation, defaultSenderTitle }),
    };
  };

  const [templateId, setTemplateId] = useState(EMAIL_TEMPLATES[0].id);
  const [fields, setFields] = useState<Record<string, string>>(() => buildDefaultFields(EMAIL_TEMPLATES[0].id));
  // Kept across a template change on purpose — the mockup links you're
  // sending don't stop being the right links because you switched from
  // "Custom message" to "Follow-up".
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [to, setTo] = useState(recipientEmail);
  const [toName, setToName] = useState(recipientName || '');
  const [editingRecipient, setEditingRecipient] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentVia, setSentVia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Below md the two panes stack, so only one is on screen at a time.
  const [mobilePane, setMobilePane] = useState<'write' | 'preview'>('write');
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'phone'>('desktop');
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings/gmail')
      .then((r) => r.json())
      .then((data) => setGmailConnected(!!data.willLandInGmailSent))
      .catch(() => setGmailConnected(null));
    fetch('/api/admin/settings/profile')
      .then((r) => r.json())
      .then((data) => {
        if (data.title) {
          setDefaultSenderTitle(data.title);
          setFields((prev) => (prev.senderTitle ? prev : { ...prev, senderTitle: data.title }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const template = getTemplate(templateId)!;

  const setField = (key: string, value: string) => setFields((f) => ({ ...f, [key]: value }));

  // Every reason this email isn't ready. A button whose link is missing or
  // unusable renders as no button at all in the email, so it's caught here
  // rather than discovered by whoever was supposed to click it.
  const attachmentIssues = attachmentProblems(attachments);
  const fieldIssues: Record<string, string> = {};
  for (const field of template.fields) {
    if (field.type !== 'url') continue;
    const problem = describeUrlProblem(fields[field.key]);
    if (problem) fieldIssues[field.key] = problem;
  }
  if (fields.ctaLabel?.trim() && !fields.ctaUrl?.trim()) {
    fieldIssues.ctaUrl = "This button has no link, so it wouldn't do anything when tapped.";
  }
  const missingRequired = template.fields.filter((f) => f.required && !fields[f.key]?.trim());
  const blocked = Object.keys(attachmentIssues).length > 0 || Object.keys(fieldIssues).length > 0;

  const sendPayload = attachmentsForSend(attachments);

  const visibleFields = useMemo(
    () =>
      // The custom-headline text box only makes sense once "Custom headline…"
      // is picked in the select above it — otherwise it's just dead space
      // that never affects the email.
      template.fields.filter((field) => field.key !== 'headlineCustom' || fields.headline === '__custom__'),
    [template, fields.headline]
  );

  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch('/api/admin/email/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, toName, company, fields, attachments: sendPayload }),
        });
        const data = await res.json();
        if (res.ok) {
          setPreviewHtml(data.html);
          setPreviewSubject(data.subject);
        }
      } catch {
        // preview is best-effort; sending still validates server-side
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, toName, company, JSON.stringify(fields), JSON.stringify(sendPayload)]);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          to,
          toName,
          company,
          fields,
          attachments: sendPayload,
          leadId,
          clientId,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send');
        setSending(false);
        return;
      }
      setSentVia(data.sentVia);
      onSent?.();
      setTimeout(onClose, 1400);
    } catch {
      setError('Failed to send');
      setSending(false);
    }
  };

  return (
    <Modal
      title="New message"
      subtitle={`To ${recipientName ? `${recipientName} · ` : ''}${recipientEmail}`}
      onClose={onClose}
      size="max-w-[68rem]"
      panelClassName="relative max-h-[92vh] overflow-hidden flex flex-col"
      showHeader={false}
      // A drafted email is the most expensive thing in the admin to lose.
      closeOnBackdrop={false}
    >
      <>
        {/* A sheen along the top edge, so the panel reads as lit from above
            rather than as a flat rectangle sitting on a flat backdrop. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-2xl bg-[radial-gradient(80%_100%_at_50%_0%,rgba(125,211,252,0.07),transparent_70%)]"
        />

        {/* Title bar */}
        <header className="relative flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight text-white">New message</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-white/35">
              {template.label} · {company || recipientName || recipientEmail}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="md:hidden">
              <SegmentedControl
                ariaLabel="Composer pane"
                size="sm"
                value={mobilePane}
                onChange={setMobilePane}
                options={[
                  { value: 'write', label: 'Write', icon: <PenLine size={11} aria-hidden="true" /> },
                  { value: 'preview', label: 'Preview', icon: <Monitor size={11} aria-hidden="true" /> },
                ]}
              />
            </div>
            <ModalCloseButton onClose={onClose} />
          </div>
        </header>

        {sentVia ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/10 ring-1 ring-inset ring-emerald-400/25">
              <CheckCircle2 size={22} className="text-emerald-300" aria-hidden="true" />
            </span>
            <p className="text-[15px] font-medium text-white">
              Sent{sentVia !== 'resend' ? ' from your Gmail' : ''}
            </p>
            {sentVia === 'resend' && (
              <p className="max-w-xs text-[12.5px] leading-relaxed text-amber-200/70">
                It went out, but not from your own Gmail — it won't appear in your Sent folder. Connect Gmail in
                Settings to fix that.
              </p>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
            {/* ── Write ─────────────────────────────────────────────── */}
            <div
              className={`flex min-h-0 flex-col md:w-[47%] md:border-r md:border-white/[0.06] ${
                mobilePane === 'write' ? 'flex' : 'hidden md:flex'
              }`}
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                {/* To */}
                <Section>
                  {editingRecipient ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <Field label="Email">
                        <input value={to} onChange={(e) => setTo(e.target.value)} className={inputClasses} autoFocus />
                      </Field>
                      <Field label="Name">
                        <input value={toName} onChange={(e) => setToName(e.target.value)} className={inputClasses} />
                      </Field>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-[12.5px] text-white/35">To</span>
                      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-white/[0.07] bg-white/[0.03] py-1.5 pl-1.5 pr-4">
                        <Avatar name={toName} email={to} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] leading-tight text-white">
                            {toName || to}
                          </span>
                          {toName && <span className="block truncate text-[12px] text-white/35">{to}</span>}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingRecipient(true)}
                        className="shrink-0 text-[12.5px] text-sky-300/80 transition-colors hover:text-sky-200"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </Section>

                {/* Template */}
                <Section title="Template">
                  <SelectMenu
                    ariaLabel="Email template"
                    value={templateId}
                    options={TEMPLATE_OPTIONS}
                    onChange={(id) => {
                      setTemplateId(id);
                      setFields(buildDefaultFields(id));
                    }}
                  />
                </Section>

                {/* Message */}
                {visibleFields.length > 0 && (
                  <Section title="Message">
                    <div className="space-y-4">
                      {visibleFields.map((field) => (
                        <Field
                          key={field.key}
                          label={field.label}
                          required={field.required}
                          hint={field.hint}
                          warning={field.helpText}
                          error={fieldIssues[field.key]}
                        >
                          {field.type === 'textarea' ? (
                            <textarea
                              value={fields[field.key] || ''}
                              onChange={(e) => setField(field.key, e.target.value)}
                              placeholder={field.placeholder}
                              rows={field.key === 'body' ? 8 : 4}
                              aria-label={field.label}
                              className={`${inputClasses} resize-y leading-relaxed`}
                            />
                          ) : field.type === 'select' ? (
                            <SelectMenu
                              ariaLabel={field.label}
                              value={fields[field.key] || field.options?.[0]?.value || ''}
                              options={field.options || []}
                              onChange={(value) => setField(field.key, value)}
                            />
                          ) : (
                            <input
                              value={fields[field.key] || ''}
                              onChange={(e) => setField(field.key, e.target.value)}
                              placeholder={field.placeholder}
                              aria-label={field.label}
                              className={inputClasses}
                            />
                          )}
                          {field.examples && field.examples.length > 0 && (
                            <div className="mt-2 space-y-1.5 border-l border-white/[0.08] pl-3">
                              {field.examples.map((ex, i) => (
                                <p key={i} className="text-[12px] italic leading-snug text-white/25">
                                  “{ex}”
                                </p>
                              ))}
                            </div>
                          )}
                        </Field>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Attachments */}
                <Section title="Attachments">
                  <EmailAttachmentsEditor
                    attachments={attachments}
                    onChange={setAttachments}
                    problems={attachmentIssues}
                  />
                </Section>
              </div>

              {/* Action bar */}
              <div className="shrink-0 border-t border-white/[0.06] bg-black/20 px-6 py-3.5">
                {error && <p className="mb-2.5 text-[12.5px] text-red-300">{error}</p>}
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-white/35">
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        gmailConnected === false ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                    <span className="truncate">
                      {gmailConnected === false
                        ? "Not from your Gmail — won't reach your Sent folder"
                        : 'Sends from your Gmail'}
                    </span>
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <GhostButton onClick={onClose}>Cancel</GhostButton>
                    <PrimaryButton
                      onClick={handleSend}
                      disabled={sending || !to || blocked || missingRequired.length > 0}
                      title={
                        blocked
                          ? 'One of the links above needs fixing first'
                          : missingRequired.length > 0
                            ? `Still needed: ${missingRequired.map((f) => f.label).join(', ')}`
                            : undefined
                      }
                    >
                      {sending ? (
                        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Send size={15} aria-hidden="true" />
                      )}
                      {sending ? 'Sending' : 'Send'}
                    </PrimaryButton>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Preview ───────────────────────────────────────────── */}
            <div
              className={`min-h-0 flex-1 flex-col bg-black/25 ${mobilePane === 'preview' ? 'flex' : 'hidden md:flex'}`}
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
                <span className="flex items-center gap-2 text-[12.5px] text-white/40">
                  What they'll receive
                  {previewLoading && <Loader2 size={11} className="animate-spin text-white/25" aria-hidden="true" />}
                </span>
                <SegmentedControl
                  ariaLabel="Preview width"
                  size="sm"
                  value={previewWidth}
                  onChange={setPreviewWidth}
                  options={[
                    { value: 'desktop', label: '', icon: <Monitor size={13} aria-hidden="true" /> },
                    { value: 'phone', label: '', icon: <Smartphone size={13} aria-hidden="true" /> },
                  ]}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {previewHtml ? (
                  <div
                    className={`mx-auto flex h-full min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0812] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)] transition-[max-width] duration-300 ${
                      previewWidth === 'phone' ? 'max-w-[23rem]' : 'max-w-full'
                    }`}
                  >
                    {/* The envelope, so the subject line is read as a subject
                        line rather than as part of the email's own design. */}
                    <div className="shrink-0 space-y-1 border-b border-white/[0.06] px-4 py-3">
                      <p className="truncate text-[13px] font-semibold text-white">{previewSubject || '—'}</p>
                      <p className="truncate text-[11.5px] text-white/30">
                        to {toName || to}
                      </p>
                    </div>
                    <iframe
                      title="Email preview"
                      srcDoc={previewHtml}
                      className="min-h-[24rem] w-full flex-1 bg-transparent"
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-[12.5px] text-white/25">
                    Fill in the fields to see a preview
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    </Modal>
  );
}
