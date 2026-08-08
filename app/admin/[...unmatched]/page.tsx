import { notFound } from 'next/navigation';

/**
 * The route that makes app/admin/not-found.tsx reachable.
 *
 * A segment-level `not-found.tsx` only renders for a `notFound()` thrown
 * *inside* that segment. A URL matching no route at all never enters the
 * segment, so Next falls back to the root `app/not-found.tsx` — which is why
 * adding app/admin/not-found.tsx on its own changed nothing, and every mistyped
 * admin URL still produced the marketing 404 with the public nav and "Get in
 * touch". Found by requesting /admin/no-such-page in a browser and reading the
 * links off the page, which were `/`, `/web`, `/ios`, `/#contact`.
 *
 * This catch-all gives those URLs a route to match, inside /admin, whose only
 * job is to hand them straight to the admin's own not-found. It is the lowest
 * priority match in the segment — every real page, static or dynamic, wins over
 * it — so nothing that already worked is affected.
 *
 * Deliberately not `[[...unmatched]]`: an optional catch-all would also claim
 * `/admin` itself, which currently redirects, and taking that over would be a
 * behaviour change nobody asked for.
 */
export default function AdminCatchAll() {
  notFound();
}
