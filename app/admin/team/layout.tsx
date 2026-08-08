import { adminPageTitle } from '@/lib/admin-nav';

/**
 * The tab title for this segment, and everything nested under it.
 *
 * It has to live in a server component: `app/admin/layout.tsx` is
 * `'use client'` — as are 21 of the 24 admin pages — and a client component
 * cannot export `metadata`. Two attempts from inside that client layout both
 * failed silently before this. `document.title` in an effect is reconciled
 * back by App Router's own <title>, and a <title> element rendered from a
 * nested client component is appended *after* the root layout's, so
 * `document.title` — which is the first one in the document — still read
 * "Bothmade | Web & Apple Native Development". Only real metadata replaces it.
 *
 * The string comes from adminPageTitle() so the tab says the same word as the
 * sidebar, rather than a second list that can drift from ADMIN_NAV_ITEMS.
 */
export const metadata = { title: adminPageTitle('/admin/team') };

export default function TeamAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
