'use client';

import { FileText, ImageIcon, LinkIcon, Paperclip, Plus, Trash2 } from 'lucide-react';
import { ATTACHMENT_KINDS, type AttachmentKind } from '@/lib/email-attachments';
import { describeUrlProblem } from '@/lib/html';
import { SegmentedControl, inputClasses } from './composer-ui';

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

/**
 * The rows a template wants laid out before anyone starts typing.
 *
 * Labelled and captioned, links blank. A send goes wrong when somebody
 * forgets the second file, not when they mislabel the first — so the rows
 * exist ahead of the memory, and a row nobody fills in simply doesn't send.
 */
export function starterAttachments(
  starters: Array<{ kind: AttachmentKind; label: string; note?: string }> | undefined
): AttachmentDraft[] {
  return (starters ?? []).map((starter) => ({
    ...newAttachment(starter.kind),
    label: starter.label,
    note: starter.note ?? '',
  }));
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
  const update = (id: string, patch: Partial<AttachmentDraft>) =>
    onChange(attachments.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const remove = (id: string) => onChange(attachments.filter((a) => a.id !== id));
  const add = (kind: AttachmentKind) => onChange([...attachments, newAttachment(kind)]);

  if (attachments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/[0.09] px-4 py-5 text-center">
        <Paperclip size={16} className="mx-auto mb-2 text-white/20" aria-hidden="true" />
        <p className="mb-3 text-[12.5px] leading-snug text-white/35">
          Add a PDF, a picture, or a link and it arrives as its own button in the email.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {ATTACHMENT_KINDS.map((kind) => {
            const Icon = KIND_ICON[kind.value];
            return (
              <button
                key={kind.value}
                type="button"
                onClick={() => add(kind.value)}
                className="flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3 py-1.5 text-[12.5px] text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
              >
                <Icon size={12} aria-hidden="true" />
                {kind.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {attachments.map((attachment, index) => {
        const kind = ATTACHMENT_KINDS.find((k) => k.value === attachment.kind)!;
        const problem = problems[attachment.id];
        return (
          <div
            key={attachment.id}
            className={`rounded-2xl border bg-white/[0.02] p-3 transition-colors ${
              problem ? 'border-red-400/35 bg-red-400/[0.04]' : 'border-white/[0.07]'
            }`}
          >
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <SegmentedControl
                ariaLabel={`Attachment ${index + 1} type`}
                size="sm"
                value={attachment.kind}
                onChange={(value) => update(attachment.id, { kind: value })}
                options={ATTACHMENT_KINDS.map((k) => {
                  const KindIcon = KIND_ICON[k.value];
                  return { value: k.value, label: k.label, icon: <KindIcon size={11} aria-hidden="true" /> };
                })}
              />
              <button
                type="button"
                onClick={() => remove(attachment.id)}
                aria-label={`Remove attachment ${index + 1}`}
                className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-red-300"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2">
              <input
                value={attachment.label}
                onChange={(e) => update(attachment.id, { label: e.target.value })}
                placeholder={`Button text — e.g. “${kind.fallbackLabel}”`}
                aria-label={`Attachment ${index + 1} button text`}
                className={`${inputClasses} font-medium`}
              />
              <input
                value={attachment.url}
                onChange={(e) => update(attachment.id, { url: e.target.value })}
                placeholder="https://drive.google.com/file/d/..."
                aria-label={`Attachment ${index + 1} link`}
                className={inputClasses}
              />
              <input
                value={attachment.note}
                onChange={(e) => update(attachment.id, { note: e.target.value })}
                placeholder="One line under the button (optional)"
                aria-label={`Attachment ${index + 1} note`}
                className={`${inputClasses} py-2 text-[12.5px]`}
              />
            </div>

            {problem ? (
              <p className="mt-2 text-[12px] leading-snug text-red-300">{problem}</p>
            ) : (
              // Only while the row is still empty. Once there's a link in it,
              // the same paragraph repeated under every card is just noise.
              !compact && !attachment.url.trim() && (
                <p className="mt-2 text-[12px] leading-snug text-white/25">{kind.hint}</p>
              )
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-1.5">
        {ATTACHMENT_KINDS.map((kind) => {
          const Icon = KIND_ICON[kind.value];
          return (
            <button
              key={kind.value}
              type="button"
              onClick={() => add(kind.value)}
              className="flex items-center gap-1.5 rounded-full border border-white/[0.09] px-3 py-1.5 text-[12.5px] text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
            >
              <Plus size={11} aria-hidden="true" />
              <Icon size={12} aria-hidden="true" />
              {kind.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
