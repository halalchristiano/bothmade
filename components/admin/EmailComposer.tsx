'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Send, Loader2, CheckCircle2, Eye } from 'lucide-react';
import { EMAIL_TEMPLATES, getTemplate } from '@/lib/email-templates';

/**
 * The one place any team member sends a branded, on-template email to a lead
 * or client — instead of everyone drafting their own emails by hand, this
 * fills in the same header/footer/CTA shell every transactional email uses,
 * and (if the sender connected Gmail in Settings) actually sends through
 * their own Gmail account so it lands in their real Sent folder. A live
 * preview renders the exact same HTML the send call would produce, so what
 * you see here is what the recipient actually gets — not an approximation.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Fields that are safe to auto-fill because they're derived from data we
// already have on the lead/project, not guessed — the observation field is
// the one thing that's never safe to invent, so it only fills in when a
// real one-liner was researched and stored ahead of time.
function defaultsForTemplate(
  templateId: string,
  ctx: { leadId?: string; projectId?: string; defaultObservation?: string | null; defaultSenderTitle?: string | null }
): Record<string, string> {
  const d: Record<string, string> = {};
  if ((templateId === 'proposal_followup' || templateId === 'contract_reminder') && ctx.leadId) {
    d.signUrl = `${SITE_URL}/sign/${ctx.leadId}`;
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

export function EmailComposer({
  recipientEmail,
  recipientName,
  company,
  defaultLoomUrl,
  defaultPainPoint,
  defaultObservation,
  leadId,
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
      ...defaultsForTemplate(id, { leadId, projectId, defaultObservation, defaultSenderTitle }),
    };
  };

  const [templateId, setTemplateId] = useState(EMAIL_TEMPLATES[0].id);
  const [fields, setFields] = useState<Record<string, string>>(() => buildDefaultFields(EMAIL_TEMPLATES[0].id));
  const [to, setTo] = useState(recipientEmail);
  const [toName, setToName] = useState(recipientName || '');
  const [sending, setSending] = useState(false);
  const [sentVia, setSentVia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);
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

  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch('/api/admin/email/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, toName, company, fields }),
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
  }, [templateId, toName, company, JSON.stringify(fields)]);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, to, toName, company, fields, leadId, clientId, projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send');
        setSending(false);
        return;
      }
      setSentVia(data.sentVia);
      onSent?.();
      setTimeout(onClose, 1200);
    } catch {
      setError('Failed to send');
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-white/10 bg-[#0a0812] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start p-6 pb-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold">Compose email</h2>
            <p className="text-xs text-white/40 mt-0.5">
              To {recipientName ? `${recipientName} · ` : ''}
              {recipientEmail}
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {sentVia ? (
          <div className="flex flex-col items-center gap-2 text-sm py-10 justify-center">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 size={18} />
              Sent{sentVia === 'gmail-app-password' || sentVia === 'delegated' ? ' from your Gmail' : ''}
            </div>
            {sentVia === 'resend' && (
              <p className="text-xs text-amber-300/80 max-w-xs text-center">
                Sent, but not from your own Gmail — it won't show up in your Sent folder. Connect Gmail in
                Settings to fix that.
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* LEFT: form */}
            <div className="md:w-[46%] overflow-y-auto px-6 pb-6">
              <label className="block text-xs text-white/50 mb-1.5">Template</label>
              <select
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setFields(buildDefaultFields(e.target.value));
                }}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
              >
                {EMAIL_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#0a0812]">
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/30 mb-4">{template.description}</p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Recipient email</label>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Recipient name</label>
                  <input
                    value={toName}
                    onChange={(e) => setToName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                  />
                </div>
              </div>

              <div className="space-y-3 mb-4">
                {template.fields
                  // The custom-headline text box only makes sense once "Custom
                  // headline…" is picked in the select above it — otherwise it's
                  // just dead space that never affects the email.
                  .filter((field) => field.key !== 'headlineCustom' || fields.headline === '__custom__')
                  .map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs text-white/50 mb-1.5">
                      {field.label}
                      {field.required && <span className="text-red-400"> *</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={fields[field.key] || ''}
                        onChange={(e) => setField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={4}
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={fields[field.key] || field.options?.[0]?.value || ''}
                        onChange={(e) => setField(field.key, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-[#0a0812]">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={fields[field.key] || ''}
                        onChange={(e) => setField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                      />
                    )}
                    {field.helpText && <p className="text-xs text-amber-200/70 mt-1.5">{field.helpText}</p>}
                    {field.examples && field.examples.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {field.examples.map((ex, i) => (
                          <p key={i} className="text-xs text-white/30 italic">
                            "{ex}"
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

              {gmailConnected === false && (
                <p className="text-xs text-amber-300/80 mb-3">
                  Your Gmail isn't connected — this will send from a shared address and won't show up in your
                  Sent folder. Connect it in Settings first if that matters to you.
                </p>
              )}

              <button
                onClick={() => setShowPreviewMobile(true)}
                className="md:hidden w-full flex items-center justify-center gap-2 rounded-xl border border-white/15 py-2.5 text-sm font-medium mb-3"
              >
                <Eye size={14} /> Preview email
              </button>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !to}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>

            {/* RIGHT: live preview */}
            <div
              className={`md:w-[54%] md:border-l border-white/10 bg-black/20 flex-col ${
                showPreviewMobile ? 'flex fixed inset-0 z-10 bg-[#0a0812]' : 'hidden md:flex'
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-white/40">
                  <Eye size={12} />
                  Live preview
                  {previewLoading && <Loader2 size={11} className="animate-spin ml-1" />}
                </div>
                <button onClick={() => setShowPreviewMobile(false)} className="md:hidden text-white/40 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              {previewSubject && (
                <p className="px-4 py-2 text-xs text-white/50 border-b border-white/10 shrink-0 truncate">
                  <span className="text-white/30">Subject: </span>
                  {previewSubject}
                </p>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto bg-white/[0.02]">
                {previewHtml ? (
                  <iframe title="Email preview" srcDoc={previewHtml} className="w-full h-full min-h-[500px] bg-transparent" />
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-white/30 py-10">
                    Fill in the fields to see a preview
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
