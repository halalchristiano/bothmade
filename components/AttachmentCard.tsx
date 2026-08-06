'use client';

import {
  ArrowUpRight,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  Link2,
  Presentation,
  Shapes,
} from 'lucide-react';
import { describeAttachment, type Attachment, type AttachmentKind } from '@/lib/attachments';

/**
 * An attachment, rendered as something worth opening.
 *
 * A shared link used to arrive as `📎 filename` — grey, ten pixels, sitting
 * under a message and indistinguishable from the timestamp beside it. On the
 * client's dashboard that is the studio handing over a design, a contract, a
 * walkthrough video, and it looked like a footnote. This is the same link,
 * given the space the thing behind it deserves: what kind of document it is,
 * where it lives, and a target big enough to hit on a phone.
 *
 * `tone` exists because one of these has to sit inside a bubble with a bright
 * gradient behind it, where white-on-white borders disappear. Everywhere else
 * it is the dark card.
 */

const ICONS: Record<AttachmentKind, typeof FileText> = {
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  pdf: FileText,
  folder: Folder,
  design: Shapes,
  video: Film,
  image: FileImage,
  code: FileCode2,
  archive: FileArchive,
  link: Link2,
};

/** The colour each kind carries, so a thread of links is scannable by shape. */
const TINTS: Record<AttachmentKind, string> = {
  doc: 'from-sky-400/25 to-sky-500/10 text-sky-200',
  sheet: 'from-emerald-400/25 to-emerald-500/10 text-emerald-200',
  slides: 'from-orange-400/25 to-orange-500/10 text-orange-200',
  pdf: 'from-red-400/25 to-red-500/10 text-red-200',
  folder: 'from-amber-400/25 to-amber-500/10 text-amber-200',
  design: 'from-purple-400/25 to-fuchsia-500/10 text-purple-200',
  video: 'from-pink-400/25 to-rose-500/10 text-pink-200',
  image: 'from-teal-400/25 to-teal-500/10 text-teal-200',
  code: 'from-slate-300/25 to-slate-400/10 text-slate-200',
  archive: 'from-yellow-400/25 to-yellow-500/10 text-yellow-200',
  link: 'from-white/20 to-white/5 text-white/70',
};

export function AttachmentCard({
  attachment,
  tone = 'dark',
  compact = false,
}: {
  attachment: Attachment;
  /** 'onGradient' for a bubble that already has a bright background. */
  tone?: 'dark' | 'onGradient';
  /** Tighter, for a busy internal thread rather than a client's dashboard. */
  compact?: boolean;
}) {
  const meta = describeAttachment(attachment);
  const Icon = ICONS[meta.kind];
  const onGradient = tone === 'onGradient';

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 rounded-xl border transition-all ${
        compact ? 'px-2.5 py-2' : 'px-3.5 py-3'
      } ${
        onGradient
          ? 'border-black/15 bg-black/[0.07] hover:bg-black/[0.12]'
          : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]'
      }`}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${
          compact ? 'h-8 w-8' : 'h-10 w-10'
        } ${onGradient ? 'from-black/20 to-black/5 text-black/70' : TINTS[meta.kind]}`}
      >
        <Icon size={compact ? 14 : 17} />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-medium ${compact ? 'text-xs' : 'text-sm'} ${
            onGradient ? 'text-black' : 'text-white/90'
          }`}
        >
          {attachment.name}
        </span>
        <span
          className={`block truncate text-[11px] ${onGradient ? 'text-black/50' : 'text-white/40'}`}
        >
          {meta.typeLabel}
          {meta.host && ` · ${meta.host}`}
        </span>
      </span>

      <ArrowUpRight
        size={compact ? 13 : 15}
        className={`shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
          onGradient ? 'text-black/40' : 'text-white/30'
        }`}
      />
    </a>
  );
}

/**
 * A list of them, laid out so one link reads as a headline and four read as a
 * list. Two columns from `sm` up, because a single column of full-width cards
 * on a desktop dashboard wastes the whole right half of the thread.
 */
export function AttachmentList({
  attachments,
  tone = 'dark',
  compact = false,
  className = '',
}: {
  attachments: Attachment[];
  tone?: 'dark' | 'onGradient';
  compact?: boolean;
  className?: string;
}) {
  if (attachments.length === 0) return null;
  return (
    <div
      className={`grid gap-2 ${attachments.length > 1 ? 'sm:grid-cols-2' : ''} ${className}`}
    >
      {attachments.map((a, i) => (
        <AttachmentCard key={`${a.url}-${i}`} attachment={a} tone={tone} compact={compact} />
      ))}
    </div>
  );
}
