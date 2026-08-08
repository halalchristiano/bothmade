'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { BrandButton } from '@/components/admin/ui';

/**
 * When an admin screen throws, staff should still be in the admin.
 *
 * Until this file existed, the only error boundary in the app was
 * app/error.tsx — the marketing one. So a render error on any of the twenty
 * admin pages dropped whoever was signed in onto a full-bleed brand page
 * with the public nav across the top (Web, iOS, Vision Pro, Pricing,
 * Contact), the sentence "Something went wrong on our side", and two ways
 * out: "Try again", and "Back home" pointing at the marketing site. A person
 * mid-way through a project got the studio's own sales pitch and no route
 * back to the page they were on.
 *
 * Per the error.js docs, this boundary wraps the page and any nested layouts
 * but not app/admin/layout.tsx above it — so the shell, the nav and the
 * search stay on screen, and everything except the broken panel is still
 * reachable. That is the whole point: one screen failing is one screen, not
 * the end of the session.
 *
 * `retry` rather than `reset`. These pages fail because a fetch came back
 * with something they could not render, and `reset()` re-renders the same
 * children without re-fetching — a "Try again" that reliably lands on the
 * identical error, which is worse than no button. `retry()` re-fetches.
 */
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 md:px-8">
      <div className="rounded-2xl border border-red-400/25 bg-red-400/[0.05] p-6 md:p-8">
        <p className="flex items-center gap-2 text-sm font-semibold text-red-200">
          <AlertTriangle size={16} />
          This screen didn&apos;t load
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          Something on this page threw while rendering. The rest of the admin is unaffected — the nav
          above still works, and nothing has been changed or lost.
        </p>

        {/*
         * The digest, when there is one. It is the hash that matches this
         * crash to its line in the server logs, and in a two-person studio
         * the person who saw it is usually the person who will go looking.
         */}
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-white/30">Reference: {error.digest}</p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <BrandButton onClick={() => retry()}>Try again</BrandButton>
          <Link
            href="/admin/dashboard"
            className="rounded-lg border border-white/12 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.06]"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
