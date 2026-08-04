import { redirect } from 'next/navigation';

/**
 * Kept as a redirect rather than deleted. Pipeline, Who to call and Leads
 * were three of the four separate sales destinations that got collapsed into
 * /admin/sales — but they are linked from emails, from the dashboard, from
 * the command palette and from whatever anyone has bookmarked, and a 404 is
 * a worse answer than the page they were looking for.
 */
export default function LegacySalesRoute() {
  redirect('/admin/sales?view=list');
}
