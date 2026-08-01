'use client';

import { useState } from 'react';
import { X, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { EMAIL_TEMPLATES, getTemplate } from '@/lib/email-templates';

/**
 * The one place any team member sends a branded, on-template email to a lead
 * or client — instead of everyone drafting their own emails by hand, this
 * fills in the same header/footer/CTA shell every transactional email uses,
 * and (if the sender connected Gmail in Settings) actually sends through
 * their own Gmail account so it lands in their real Sent folder.
 */
export function EmailComposer({
  recipientEmail,
  recipientName,
  company,
  defaultLoomUrl,
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
  leadId?: string;
  clientId?: string;
  projectId?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [templateId, setTemplateId] = useState(EMAIL_TEMPLATES[0].id);
  const [fields, setFields] = useState<Record<string, string>>(
    defaultLoomUrl ? { loomUrl: defaultLoomUrl } : {}
  );
  const [to, setTo] = useState(recipientEmail);
  const [toName, setToName] = useState(recipientName || '');
  const [sending, setSending] = useState(false);
  const [sentVia, setSentVia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const template = getTemplate(templateId)!;

  const setField = (key: string, value: string) => setFields((f) => ({ ...f, [key]: value }));

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
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0812] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
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
          <div className="flex items-center gap-2 text-emerald-300 text-sm py-6 justify-center">
            <CheckCircle2 size={18} />
            Sent{sentVia === 'gmail' ? ' from your Gmail' : ''}
          </div>
        ) : (
          <>
            <label className="block text-xs text-white/50 mb-1.5">Template</label>
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setFields(defaultLoomUrl ? { loomUrl: defaultLoomUrl } : {});
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
              {template.fields.map((field) => (
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
                  ) : (
                    <input
                      value={fields[field.key] || ''}
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                    />
                  )}
                </div>
              ))}
            </div>

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
                disabled={sending || !to}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-purple-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
