'use client';

import Link from 'next/link';

/** One entry in the dashboard's activity feed. */
export interface ActivityItem {
  type: 'message' | 'payment' | 'proposal';
  id: string;
  projectId: string | null;
  leadId?: string;
  label: string;
  preview: string;
  createdAt: string;
}

/**
 * One line of the feed, linked only when there is somewhere to go.
 *
 * A row with neither a project nor a lead behind it rendered as `href="#"`:
 * it looked clickable, highlighted on hover, and then scrolled you to the top
 * of the page. That reads as a broken click rather than as "there is nothing
 * more to see here", which is what is actually true.
 *
 * The timestamp gained a time. Everything in this feed is recent by
 * construction — it is capped at the last 25 of each kind — so a column of
 * identical dates was the one part of the row carrying no information, on the
 * card whose whole subject is what happened in what order.
 *
 * Its own file rather than a named export beside a page's default one, which
 * is where it started so a test could reach it — the rest of the dashboard's
 * testable pieces already live here.
 */
export function ActivityRow({ item }: { item: ActivityItem }) {
  const href = item.projectId
    ? `/admin/projects/${item.projectId}`
    : item.leadId
      ? `/admin/leads/${item.leadId}`
      : null;

  const body = (
    <>
      <div className="flex justify-between items-start gap-2">
        <p className="text-sm font-medium">{item.label}</p>
        <span className="text-[10px] text-white/30 whitespace-nowrap">
          {new Date(item.createdAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>
      <p className="text-xs text-white/40 mt-0.5">{item.preview}</p>
    </>
  );

  const shell = 'block px-3 py-2.5 rounded-xl border-l-2 border-sky-400/40 transition-colors';
  return href ? (
    <Link href={href} className={`${shell} hover:bg-white/[0.05]`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
