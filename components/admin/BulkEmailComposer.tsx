'use client';

import { useMemo, useState } from 'react';
import { X, Send, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { EMAIL_TEMPLATES, getTemplate } from '@/lib/email-templates';

export interface BulkRecipient {
  id: string;
  company: string;
  contactName: string | null;
  email: string | null;
}

// Sales-facing templates make sense to blast to a list; ops templates
// (project updates, requirements requests) are always one-to-one.
const BULK_TEMPLATES = EMAIL_TEMPLATES.filter((t) => t.audience !== 'ops');

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
  const [sharedFields, setSharedFields] = useState<Record<string, string>>({});
  const [perLead, setPerLead] = useState<Record<string, Record<string, string>>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sentCount: number; total: number; failures: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const template = getTemplate(templateId)!;
  const emailable = useMemo(() => recipients.filter((r) => r.email), [recipients]);
  const missingEmail = recipients.length - emailable.length;

  // Fields that require genuine per-recipient personalization (like the
  // observation line) get their own input per lead. Everything else — a
  // scheduling link, a title — is filled in once and shared across the send.
  const personalizeFields = template.fields.filter((f) => f.required && f.type === 'textarea');
  const sharedTemplateFields = template.fields.filter((f) => !personalizeFields.includes(f));

  const setShared = (key: string, value: string) => setSharedFields((f) => ({ ...f, [key]: value }));
  const setPerLeadField = (leadId: string, key: string, value: string) =>
    setPerLead((p) => ({ ...p, [leadId]: { ...(p[leadId] || {}), [key]: value } }));

  const canSend =
    emailable.length > 0 &&
    sharedTemplateFields.every((f) => !f.required || sharedFields[f.key]) &&
    personalizeFields.every((f) => emailable.every((r) => perLead[r.id]?.[f.key]));

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0812] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold">Send to {recipients.length} lead{recipients.length === 1 ? '' : 's'}</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {missingEmail > 0 ? `${missingEmail} skipped — no email on file. ` : ''}
              {emailable.length} will receive this.
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-sm mb-2">
              Sent <strong>{result.sentCount}</strong> of {result.total}.
            </p>
            {result.failures.length > 0 && (
              <div className="text-left mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 space-y-1">
                {result.failures.map((f, i) => (
                  <p key={i} className="text-xs text-red-300">
                    {f}
                  </p>
                ))}
              </div>
            )}
            <button
              onClick={onClose}
              className="mt-4 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 px-5 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <label className="block text-xs text-white/50 mb-1.5">Template</label>
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setSharedFields({});
                setPerLead({});
              }}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            >
              {BULK_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#0a0812]">
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-white/30 mb-4">{template.description}</p>

            {sharedTemplateFields.length > 0 && (
              <div className="space-y-3 mb-4">
                <p className="text-xs font-semibold text-white/50">Same for every recipient</p>
                {sharedTemplateFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs text-white/50 mb-1.5">
                      {field.label}
                      {field.required && <span className="text-red-400"> *</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={sharedFields[field.key] || ''}
                        onChange={(e) => setShared(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                      />
                    ) : (
                      <input
                        value={sharedFields[field.key] || ''}
                        onChange={(e) => setShared(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {personalizeFields.length > 0 && (
              <div className="mb-4">
                <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 mb-3">
                  <AlertTriangle size={14} className="text-amber-300 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200/80">
                    {personalizeFields[0].helpText ||
                      'These fields need a genuine answer per recipient — that personalization is what makes this different from a mail blast.'}
                  </p>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {emailable.map((r) => (
                    <div key={r.id} className="rounded-xl border border-white/10 p-3">
                      <p className="text-sm font-medium mb-2">{r.company}</p>
                      {personalizeFields.map((field) => (
                        <textarea
                          key={field.key}
                          value={perLead[r.id]?.[field.key] || ''}
                          onChange={(e) => setPerLeadField(r.id, field.key, e.target.value)}
                          placeholder={field.placeholder}
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !canSend}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {sending ? 'Sending...' : `Send to ${emailable.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
