'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * "Updated 4m ago", and a way to ask again.
 *
 * Shared rather than owned by the page, because the dashboard has two things
 * that load independently — the Today panel and the breakdown behind it — and
 * a single indicator sitting at the top of the page was making a claim about
 * whichever one it happened to be wired to. A freshness label attached to the
 * wrong data is worse than none: it is the page telling you it is current
 * while showing you this morning.
 */
export function formatRelativeTime(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

export function RefreshIndicator({
  lastUpdated,
  refreshing,
  onRefresh,
  className = '',
}: {
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  className?: string;
}) {
  const [, forceTick] = useState(0);

  // Re-render every 30s so the "Xm ago" label stays current without a refetch.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      className={`inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-60 ${className}`}
      title="Refresh"
      aria-label="Refresh"
    >
      <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
      {refreshing ? 'Refreshing…' : lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : ''}
    </button>
  );
}
