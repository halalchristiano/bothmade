'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import { EMAIL_TEMPLATES, getTemplate } from '@/lib/email-templates';
import { buildFallbackColdEmailDraft } from '@/lib/leads';
import { draftBodyOnly, firstNameOf, personalize } from '@/lib/cold-email';
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
  SelectMenu,
  inputClasses,
} from './composer-ui';
import { Modal, ModalCloseButton } from './Modal';

export interface BulkRecipient {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
  personalizedObservation?: string | null;
  coldEmailDraft?: string | null;
  painPoints?: string;
}

// Sales-facing templates make sense to blast to a list; ops templates
// (project updates, requirements requests) are always one-to-one.
const BULK_TEMPLATES = EMAIL_TEMPLATES.filter((t) => t.audience !== 'ops');

const BULK_TEMPLATE_OPTIONS = BULK_TEMPLATES.map((t) => ({
  value: t.id,
  label: t.label,
  description: t.description,
  group: t.group,
}));

export function BulkEmailComposer({
  recipients,
  onClose,
  onSent,
}: {
  recipients: BulkRecipient[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [templateId, setTemplateId] = useState(BULK_TEMPLATES[0].id);
  const [sharedFields, setSharedFields] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const f of BULK_TEMPLATES[0].fields) {
      if (f.type === 'select' && f.options?.[0]) d[f.key] = f.options[0].value;
    }
    return d;
  });
  // Shared across the batch, like sharedFields — the same mockup PDF goes to
  // everyone on the list, and survives a template change.
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [perLead, setPerLead] = useState<Record<string, Record<string, string>>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sentCount: number; total: number; failures: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);

  const template = getTemplate(templateId)!;
  const emailable = useMemo(() => recipients.filter((r) => r.email), [recipients]);
  const missingEmail = recipients.length - emailable.length;
  const withOwnDraft = useMemo(() => emailable.filter((r) => r.coldEmailDraft).length, [emailable]);

  // Fields that require genuine per-recipient personalization (like the
  // observation line) get their own input per lead. Everything else — a
  // scheduling link, a title — is filled in once and shared across the send.
  const personalizeFields = template.fields.filter((f) => f.required && f.type === 'textarea');
  const sharedTemplateFields = template.fields.filter((f) => !personalizeFields.includes(f));

  const setShared = (key: string, value: string) => setSharedFields((f) => ({ ...f, [key]: value }));
  const setPerLeadField = (leadId: string, key: string, value: string) =>
    setPerLead((p) => ({ ...p, [leadId]: { ...(p[leadId] || {}), [key]: value } }));

  const attachmentIssues = attachmentProblems(attachments);
  const sharedFieldIssues: Record<string, string> = {};
  for (const field of sharedTemplateFields) {
    if (field.type !== 'url') continue;
    const problem = describeUrlProblem(sharedFields[field.key]);
    if (problem) sharedFieldIssues[field.key] = problem;
  }
  if (sharedFields.ctaLabel?.trim() && !sharedFields.ctaUrl?.trim()) {
    sharedFieldIssues.ctaUrl = "This button has no link, so it wouldn't do anything when tapped.";
  }
  const sendAttachments = attachmentsForSend(attachments);

  const canSend =
    emailable.length > 0 &&
    Object.keys(attachmentIssues).length === 0 &&
    Object.keys(sharedFieldIssues).length === 0 &&
    sharedTemplateFields.every((f) => !f.required || sharedFields[f.key]) &&
    personalizeFields.every((f) => emailable.every((r) => perLead[r.id]?.[f.key]));

  useEffect(() => {
    if (!previewFor && emailable.length > 0) setPreviewFor(emailable[0].id);
  }, [emailable, previewFor]);

  // Seed per-recipient personalize fields from research already stored on
  // the lead, so they're never blank if that work has already been done —
  // but never overwrite something the user already typed in this session.
  // "observation" comes from the researched one-liner; "body" (the "Write
  // your own" template) falls back to that lead's own cold-email draft, or
  // a generic one built the same way "Send all now" would, so this composer
  // is never just a wall of empty boxes even when it's not the ideal tool
  // for a batch that already has bespoke per-lead drafts (those keep their
  // own subject line too, which this shared-subject composer can't send —
  // "Send prepared cold emails" is the right button for that case).
  useEffect(() => {
    const observationField = personalizeFields.find((f) => f.key === 'observation');
    const bodyField = personalizeFields.find((f) => f.key === 'body');
    if (!observationField && !bodyField) return;
    setPerLead((p) => {
      let changed = false;
      const next = { ...p };
      for (const r of emailable) {
        if (observationField && r.personalizedObservation && !next[r.id]?.observation) {
          next[r.id] = { ...(next[r.id] || {}), observation: r.personalizedObservation };
          changed = true;
        }
        if (bodyField && !next[r.id]?.body) {
          const draft =
            r.coldEmailDraft ||
            buildFallbackColdEmailDraft({
              company: r.company,
              painPoints: r.painPoints || '',
              personalizedObservation: r.personalizedObservation || null,
            });
          const body = personalize(draftBodyOnly(draft), { firstName: firstNameOf(r.contactName) });
          next[r.id] = { ...(next[r.id] || {}), body };
          changed = true;
        }
      }
      return changed ? next : p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, emailable]);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/email/send-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          sharedFields,
          attachments: sendAttachments,
          recipients: emailable.map((r) => ({
            leadId: r.id,
            to: r.email,
            toName: r.contactName || undefined,
            company: r.company,
            fields: perLead[r.id] || {},
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send');
        setSending(false);
        return;
      }
      const failures = (data.results || []).filter((x: { ok: boolean }) => !x.ok).map((x: { company?: string; error?: string }) => `${x.company || 'Unknown'}: ${x.error}`);
      setResult({ sentCount: data.sentCount, total: data.total, failures });
      onSent();
    } catch {
      setError('Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title={`Send to ${recipients.length} lead${recipients.length === 1 ? '' : 's'}`}
      onClose={onClose}
      size="max-w-[68rem]"
      panelClassName="relative max-h-[92vh] overflow-hidden flex flex-col"
      showHeader={false}
      // A half-written batch of per-recipient personalization is too much to
      // lose to a misplaced click outside the panel.
      closeOnBackdrop={false}
    >
      <>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-2xl bg-[radial-gradient(80%_100%_at_50%_0%,rgba(125,211,252,0.07),transparent_70%)]"
        />

        <header className="relative flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight text-white">
              Send to {recipients.length} lead{recipients.length === 1 ? '' : 's'}
            </h2>
            <p className="mt-0.5 truncate text-[12.5px] text-white/35">
              {missingEmail > 0 ? `${missingEmail} skipped — no email on file · ` : ''}
              {emailable.length} will receive this
            </p>
          </div>
          <ModalCloseButton onClose={onClose} />
        </header>

        {result ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/10 ring-1 ring-inset ring-emerald-400/25">
              <CheckCircle2 size={22} className="text-emerald-300" aria-hidden="true" />
            </span>
            <p className="mb-2 text-[15px] text-white">
              Sent <strong className="font-semibold">{result.sentCount}</strong> of {result.total}.
            </p>
            {result.failures.length > 0 && (
              <div className="text-left mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 space-y-1 max-w-md mx-auto">
                {result.failures.map((f, i) => (
                  <p key={i} className="text-xs text-red-300">
                    {f}
                  </p>
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-center">
              <PrimaryButton onClick={onClose}>Done</PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* LEFT: form */}
            <div className="flex min-h-0 flex-col md:w-[47%] md:border-r md:border-white/[0.06]">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <Section title="Template">
                  <SelectMenu
                    ariaLabel="Email template"
                    value={templateId}
                    options={BULK_TEMPLATE_OPTIONS}
                    onChange={(id) => {
                      const selectDefaults: Record<string, string> = {};
                      for (const f of getTemplate(id)?.fields || []) {
                        if (f.type === 'select' && f.options?.[0]) selectDefaults[f.key] = f.options[0].value;
                      }
                      setTemplateId(id);
                      setSharedFields(selectDefaults);
                      setPerLead({});
                    }}
                  />
                </Section>

                {sharedTemplateFields.length > 0 && (
                  <Section title="Same for every recipient">
                    <div className="space-y-4">
                      {sharedTemplateFields
                        .filter((field) => field.key !== 'headlineCustom' || sharedFields.headline === '__custom__')
                        .map((field) => (
                          <Field
                            key={field.key}
                            label={field.label}
                            required={field.required}
                            hint={field.hint}
                            error={sharedFieldIssues[field.key]}
                          >
                            {field.type === 'textarea' ? (
                              <textarea
                                value={sharedFields[field.key] || ''}
                                onChange={(e) => setShared(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                rows={4}
                                aria-label={field.label}
                                className={`${inputClasses} resize-y leading-relaxed`}
                              />
                            ) : field.type === 'select' ? (
                              <SelectMenu
                                ariaLabel={field.label}
                                value={sharedFields[field.key] || field.options?.[0]?.value || ''}
                                options={field.options || []}
                                onChange={(value) => setShared(field.key, value)}
                              />
                            ) : (
                              <input
                                value={sharedFields[field.key] || ''}
                                onChange={(e) => setShared(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                aria-label={field.label}
                                className={inputClasses}
                              />
                            )}
                          </Field>
                        ))}
                    </div>
                  </Section>
                )}

                <Section title="Attachments">
                  <EmailAttachmentsEditor
                    attachments={attachments}
                    onChange={setAttachments}
                    problems={attachmentIssues}
                    compact
                  />
                </Section>

                {withOwnDraft > 0 && (
                  <Section>
                    <div className="flex items-start gap-2.5 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] px-3.5 py-3">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-sky-300" aria-hidden="true" />
                      <p className="text-[12.5px] leading-relaxed text-sky-100/70">
                        {withOwnDraft} of these already {withOwnDraft === 1 ? 'has' : 'have'} its own complete
                        drafted email with its own subject line — this composer can only send one shared subject
                        to everyone. Cancel and use “Send prepared cold emails” back on the leads list instead to
                        send each one's actual draft, not a shared template.
                      </p>
                    </div>
                  </Section>
                )}

                {personalizeFields.length > 0 && (
                  <Section title="Written per recipient">
                    <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-3">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
                      <p className="text-[12.5px] leading-relaxed text-amber-100/70">
                        {personalizeFields[0].helpText ||
                          'These fields need a genuine answer per recipient — that personalization is what makes this different from a mail blast.'}
                      </p>
                    </div>
                    <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                      {emailable.map((r) => (
                        <div
                          key={r.id}
                          className={`rounded-2xl border p-3 transition-colors ${
                            previewFor === r.id
                              ? 'border-sky-400/40 bg-sky-400/[0.05]'
                              : 'border-white/[0.07] bg-white/[0.02]'
                          }`}
                        >
                          {/* The card used to be one big clickable div wrapping
                              its own textareas — unreachable by keyboard and
                              invalid nesting. The name is the button now. */}
                          <button
                            type="button"
                            onClick={() => setPreviewFor(r.id)}
                            aria-pressed={previewFor === r.id}
                            className="mb-2 flex w-full items-center gap-2.5 text-left"
                          >
                            <Avatar name={r.contactName || r.company} email={r.email || ''} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] leading-tight text-white">
                                {r.company}
                              </span>
                              <span className="block truncate text-[11.5px] text-white/30">{r.email}</span>
                            </span>
                            {previewFor === r.id ? (
                              <Eye size={13} className="shrink-0 text-sky-300" aria-hidden="true" />
                            ) : (
                              <span className="shrink-0 text-[11px] text-white/25">Preview</span>
                            )}
                          </button>
                          {personalizeFields.map((field) => (
                            <textarea
                              key={field.key}
                              value={perLead[r.id]?.[field.key] || ''}
                              onChange={(e) => setPerLeadField(r.id, field.key, e.target.value)}
                              onFocus={() => setPreviewFor(r.id)}
                              placeholder={field.placeholder}
                              aria-label={`${field.label} for ${r.company}`}
                              rows={2}
                              className={`${inputClasses} resize-y leading-relaxed`}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>

              <div className="shrink-0 border-t border-white/[0.06] bg-black/20 px-6 py-3.5">
                {error && <p className="mb-2.5 text-[12.5px] text-red-300">{error}</p>}
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[12px] text-white/35">
                    {emailable.length} recipient{emailable.length === 1 ? '' : 's'}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <GhostButton onClick={onClose}>Cancel</GhostButton>
                    <PrimaryButton onClick={handleSend} disabled={sending || !canSend}>
                      {sending ? (
                        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Send size={15} aria-hidden="true" />
                      )}
                      {sending ? 'Sending' : `Send to ${emailable.length}`}
                    </PrimaryButton>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: live preview for the selected recipient */}
            <div className="hidden min-h-0 flex-1 flex-col bg-black/25 md:flex">
              <BulkPreviewPane
                templateId={templateId}
                sharedFields={sharedFields}
                attachments={sendAttachments}
                perLead={perLead}
                recipient={emailable.find((r) => r.id === previewFor) || emailable[0]}
              />
            </div>
          </div>
        )}
      </>
    </Modal>
  );
}

function BulkPreviewPane({
  templateId,
  sharedFields,
  attachments,
  perLead,
  recipient,
}: {
  templateId: string;
  sharedFields: Record<string, string>;
  attachments: ReturnType<typeof attachmentsForSend>;
  perLead: Record<string, Record<string, string>>;
  recipient?: BulkRecipient;
}) {
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mergedFields = recipient ? { ...sharedFields, ...(perLead[recipient.id] || {}) } : sharedFields;

  useEffect(() => {
    if (!recipient) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/email/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId,
            toName: recipient.contactName,
            company: recipient.company,
            fields: mergedFields,
            attachments,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setHtml(data.html);
          setSubject(data.subject);
        }
      } catch {
        // best-effort preview
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, recipient?.id, JSON.stringify(mergedFields), JSON.stringify(attachments)]);

  if (!recipient) {
    return <div className="flex items-center justify-center h-full text-xs text-white/30 py-10">No recipients with an email on file</div>;
  }

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-white/40">
          <span className="truncate">What {recipient.company} will receive</span>
          {loading && <Loader2 size={11} className="animate-spin text-white/25" aria-hidden="true" />}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {html ? (
          <div className="mx-auto flex h-full min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0812] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)]">
            <div className="shrink-0 space-y-1 border-b border-white/[0.06] px-4 py-3">
              <p className="truncate text-[13px] font-semibold text-white">{subject || '—'}</p>
              <p className="truncate text-[11.5px] text-white/30">to {recipient.contactName || recipient.email}</p>
            </div>
            {/* sandbox="" for the reason spelled out in EmailComposer: srcDoc
                inherits our origin, and this preview is fed cold-email drafts
                built around harvested lead fields. */}
            <iframe title="Email preview" sandbox="" srcDoc={html} className="min-h-[24rem] w-full flex-1 bg-transparent" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[12.5px] text-white/25">
            Fill in the fields to see a preview
          </div>
        )}
      </div>
    </>
  );
}
