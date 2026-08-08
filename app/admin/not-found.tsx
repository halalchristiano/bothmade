import Link from 'next/link';
import { SearchX } from 'lucide-react';

/**
 * A missing admin page should leave staff in the admin.
 *
 * app/admin/error.tsx already makes this argument in full, for the case where
 * a screen throws: until it existed, a render error on any of the twenty admin
 * pages dropped whoever was signed in onto a full-bleed marketing page with
 * the public nav across the top and "Back home" pointing at the sales site.
 *
 * A 404 was still doing exactly that. Next resolves a missing route to the
 * nearest `not-found.tsx`, and the only one in the app was the marketing one —
 * so a signed-in staff member who mistyped a URL, followed a stale bookmark,
 * or clicked a link to a page that has since been renamed got the giant "Not
 * made." headline, the public nav (Web, iOS, Vision Pro, Pricing, Contact),
 * and two ways out: "Back home" to the marketing site and "Get in touch" — the
 * studio pitching a new project to one of its own two employees.
 *
 * A 404 is the more likely of the two, not the less. Errors need something to
 * go wrong; this needs a typo.
 *
 * Deliberately not a client component. There is nothing interactive here —
 * `retry()` would be meaningless, since a route that does not exist will not
 * start existing on a re-fetch — so this is one less bundle on a page whose
 * whole job is to hand somebody a link.
 *
 * Like the error boundary, this renders inside app/admin/layout.tsx rather
 * than replacing it, so the shell, the nav and the search stay on screen and
 * the rest of the admin is one click away.
 */
export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 md:px-8">
      <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-6 md:p-8">
        <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
          <SearchX size={16} />
          There&apos;s no page here
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          This address doesn&apos;t match anything in the admin. It may have been renamed, or the
          link may be older than the page. Nothing is wrong and nothing has been lost — the nav
          above still works.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {/*
            Into the admin, not out of it. The three places worth offering are
            the one that lists everything, the one most sessions start from,
            and the money — which between them reach anywhere somebody was
            trying to get to.
          */}
          <Link
            href="/admin/dashboard"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink shadow-e2 transition-colors hover:bg-white/90"
          >
            Back to dashboard
          </Link>
          <Link
            href="/admin/leads"
            className="rounded-lg border border-white/12 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.06]"
          >
            Leads
          </Link>
          <Link
            href="/admin/projects"
            className="rounded-lg border border-white/12 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.06]"
          >
            Projects
          </Link>
        </div>
      </div>
    </div>
  );
}
