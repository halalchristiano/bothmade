/**
 * The tab title for a missing admin page.
 *
 * Easy to miss, and it was missed: the generator that wrote a layout for every
 * admin segment skips directories starting with `[`, so the catch-all had none
 * and fell through to the root layout's metadata. The 404 rendered correctly —
 * admin shell, admin-only exits — under a tab reading "Bothmade | Web & Apple
 * Native Development". Caught by the evidence sheet, which checks the title on
 * this route alongside the real pages.
 *
 * Named for what happened rather than after a section, because there is no
 * section: somebody scanning their tabs for the one that went wrong should be
 * able to see it without opening it.
 */
export const metadata = { title: 'Page not found · Bothmade admin' };

export default function AdminNotFoundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
