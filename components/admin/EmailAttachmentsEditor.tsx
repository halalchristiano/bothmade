'use client';

import { useId } from 'react';
import { FileText, ImageIcon, LinkIcon, Plus, Trash2 } from 'lucide-react';
import { ATTACHMENT_KINDS, type AttachmentKind } from '@/lib/email-attachments';
import { describeUrlProblem } from '@/lib/html';

/**
 * The PDF / picture / link attachments any template can carry, on top of
 * whatever fields that template defines. Each one renders in the email as its
 * own button, so this is the same editor whether you're sending a mockup
 * concept, a proposal PDF, or a Drive folder.
 *
 * Nothing is uploaded here. The Gmail paths these emails go out on can only
 * build multipart/alternative, so a real file attachment would force every
 * message onto the provider fallback and out of the sender's own mailbox —
 * a link is what keeps the send where it belongs. Drive is the intended home.
 */

export interface AttachmentDraft {
  /** Local only — React keys survive a row being removed from the middle. */
  id: string;
  kind: AttachmentKind;
  label: string;
  url: string;
  note: string;
}

let nextId = 0;
export function newAttachment(kind: AttachmentKind): AttachmentDraft {
  nextId += 1;
  return { id: `a${nextId}`, kind, label: '', url: '', note: '' };
}

const KIND_ICON: Record<AttachmentKind, typeof FileText> = {
  pdf: FileText,
  image: ImageIcon,
  link: LinkIcon,
};

/** What actually gets sent — drops the local row id and the empty rows. */
export function attachmentsForSend(attachments: AttachmentDraft[]) {
  return attachments
    .filter((a) => a.url.trim())
    .map((a) => ({ kind: a.kind, label: a.label.trim(), url: a.url.trim(), note: a.note.trim() }));
}

/**
 * Every reason this set of attachments isn't ready to send, keyed by row id.
 * A row with nothing typed in it yet isn't an error — it just doesn't send.
 */
export function attachmentProblems(attachments: AttachmentDraft[]): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const a of attachments) {
    const url = a.url.trim();
    if (!url) {
      // A label with no link is the exact shape of a button that does
      // nothing, so it's worth stopping. An entirely blank row isn't.
      if (a.label.trim() || a.note.trim()) problems[a.id] = 'Add the link this button should open.';
      continue;
    }
    const problem = describeUrlProblem(url);
    if (problem) problems[a.id] = problem;
  }
  return problems;
}

export function EmailAttachmentsEditor({
  attachments,
  onChange,
  problems,
  compact = false,
}: {
  attachments: AttachmentDraft[];
  onChange: (next: AttachmentDraft[]) => void;
  problems: Record<string, string>;
  /** Drops the per-kind hint text, for the tighter bulk-send column. */
  compact?: boolean;
}) {
  const headingId = useId();

  const update = (id: string, patch: Partial<AttachmentDraft>) =>
    onChange(attachments.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const remove = (id: string) => onChange(attachments.filter((a) => a.id !== id));
  const add = (kind: AttachmentKind) => onChange([...attachments, newAttachment(kind)]);

  return (
    <section aria-labelledby={headingId} className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 id={headingId} className="text-xs font-semibold text-white/50">
          Attachments
        </h3>
        <div className="flex gap-1">
          {ATTACHMENT_KINDS.map((kind) => {
            const Icon = KIND_ICON[kind.value];
            return (
              <button
                key={kind.value}
                type="button"
                onClick={() => add(kind.value)}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/5 hover:text-white transition-colors"
              >
                <Plus size={10} aria-hidden="true" />
                <Icon size={11} aria-hidden="true" />
                {kind.label}
              </button>
            );
          })}
        </div>
      </div>

      {attachments.length === 0 ? (
        <p className="text-xs text-white/30">
          Optional. Add a PDF, a picture, or a link and it shows up in the email as its own button.
        </p>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const kind = ATTACHMENT_KINDS.find((k) => k.value === attachment.kind)!;
            const problem = problems[attachment.id];
            return (
              <div
                key={attachment.id}
                className={`rounded-xl border p-2.5 space-y-2 ${problem ? 'border-red-400/40 bg-red-400/5' : 'border-white/10 bg-white/[0.02]'}`}
              >
                <div className="flex items-center gap-2">
                  <select
                    value={attachment.kind}
                    onChange={(e) => update(attachment.id, { kind: e.target.value as AttachmentKind })}
                    aria-label="Attachment type"
                    className="rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                  >
                    {ATTACHMENT_KINDS.map((k) => (
                      <option key={k.value} value={k.value} className="bg-[#0a0812]">
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={attachment.label}
                    onChange={(e) => update(attachment.id, { label: e.target.value })}
                    placeholder={`Button text — e.g. "${kind.fallbackLabel}"`}
                    aria-label="Button text"
                    className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                  />
                  <button
                    type="button"
                    onClick={() => remove(attachment.id)}
                    aria-label="Remove attachment"
                    className="shrink-0 rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>

                <input
                  value={attachment.url}
                  onChange={(e) => update(attachment.id, { url: e.target.value })}
                  placeholder="https://drive.google.com/file/d/..."
                  aria-label="Link"
                  className="w-full px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                />
                <input
                  value={attachment.note}
                  onChange={(e) => update(attachment.id, { note: e.target.value })}
                  placeholder="Optional one-liner under the button"
                  aria-label="Note"
                  className="w-full px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                />

                {problem ? (
                  <p className="text-xs text-red-300">{problem}</p>
                ) : (
                  !compact && <p className="text-xs text-white/30">{kind.hint}</p>
                )}
              </div>
            );
          })}
          <p className="text-xs text-white/30">
            Drive links have to be shared with "Anyone with the link" — otherwise the recipient hits a
            permission wall. The preview shows exactly what they'll get.
          </p>
        </div>
      )}
    </section>
  );
}
