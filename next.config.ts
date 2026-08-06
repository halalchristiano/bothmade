import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Fail the *build* when a secret with no safe default is missing.
 *
 * instrumentation.ts already refuses to boot without these, but on Vercel a
 * runtime failure is the expensive kind: the build succeeds, the deployment
 * is promoted, and the site starts returning 500s. Checking here instead
 * means a missing secret fails the build, Vercel keeps the previous
 * deployment serving, and the worst case is a red build rather than a dark
 * site.
 *
 * Production builds only, so local `next dev` still starts without a full
 * .env — and so this never fires from tooling that merely imports the config.
 */
if (process.env.NODE_ENV === "production" && !process.env.CI_SKIP_SECRET_CHECK) {
  // Imported lazily: lib/env.ts is TypeScript the config loader can resolve,
  // but only the production path needs it.
  // STRIPE_SECRET_KEY belongs here even though nothing signs sessions with
  // it: five routes construct `new Stripe(...)` at module scope, so without
  // a value `next build` dies during page-data collection with "Neither
  // apiKey nor config.authenticator provided" and a stack trace pointing
  // into a minified chunk. Nothing in that message names the variable, and
  // the checklist did not mention it either — so the first deploy failed on
  // a riddle. Fail here instead, by name.
  const missing = ["JWT_SECRET", "SESSION_SECRET", "STRIPE_SECRET_KEY"].filter(
    (name) => !process.env[name]?.trim()
  );
  if (missing.length > 0) {
    // One line per variable: where it comes from differs, and a single
    // blanket instruction sent people to `openssl rand` for a Stripe key.
    const HOW: Record<string, string> = {
      JWT_SECRET:
        "signs every login session. Generate with: openssl rand -base64 48",
      SESSION_SECRET:
        "session-layer signing, and the legacy key for anything encrypted before " +
        "GMAIL_ENCRYPTION_KEY existed. Generate with: openssl rand -base64 48",
      STRIPE_SECRET_KEY:
        "read at module scope by the checkout and payment routes, so the build " +
        "cannot even collect page data without it. Copy it from " +
        "dashboard.stripe.com > Developers > API keys — it is issued, not generated",
    };
    throw new Error(
      `Refusing to build. ${missing.length > 1 ? "These are" : "This is"} not set:\n` +
        missing.map((name) => `  - ${name}: ${HOW[name]}`).join("\n") +
        "\nSet them in your host's environment and rebuild. Vercel does not apply " +
        "environment changes to an already-running deployment, so redeploy after adding them."
    );
  }
}

/**
 * Content-Security-Policy.
 *
 * **Why `script-src` allows `'unsafe-inline'` instead of using a nonce.**
 * Next streams its RSC payload through inline `<script>` tags, so a strict
 * `script-src 'self'` blocks the framework itself. The only two ways around
 * that are a per-request nonce or experimental SRI. A nonce has to be
 * injected during server rendering, which means **every page becomes
 * dynamic** — Next says so outright — and 13 of 16 admin pages, 3 of 4
 * client pages, and all 120 marketing pages are prerendered today. It would
 * also mean restructuring both dashboard layouts, since route-segment
 * config can't live in a client component and `app/admin/layout.tsx` is one.
 *
 * That price buys very little *here*. A nonce's advantage over
 * `'unsafe-inline'` is that it stops an injected inline `<script>` — but
 * injecting one requires an HTML injection sink, and this app has exactly
 * one `dangerouslySetInnerHTML` (the JSON-LD block in the root layout,
 * built from constants) and renders no user-supplied HTML anywhere else.
 * React escapes the rest. The XSS that *was* real in this codebase lived in
 * transactional email, which no CSP governs — that's fixed at the source in
 * lib/html.ts.
 *
 * So this policy takes everything a static-friendly CSP can give and skips
 * the one directive that would cost the whole rendering model. It still
 * closes the vectors that matter: loading script from another origin, a
 * `<base>` tag that silently re-points every relative script URL, form
 * submissions posting credentials off-site, plugin content, framing, and
 * arbitrary exfiltration destinations.
 *
 * Set `CSP_REPORT_ONLY=1` to ship the same policy as Report-Only — useful
 * for one deploy if you want to watch the console before enforcing.
 */
const csp = [
  "default-src 'self'",

  // See the note above. 'unsafe-eval' is React's dev-only error overlay.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,

  // 'unsafe-inline' is load-bearing for styles, not a shortcut: framer-motion
  // animates by writing inline style attributes, the app uses style={{…}}
  // widely, and the email-preview iframe renders inline-styled email HTML.
  // A nonce cannot cover style attributes at all.
  "style-src 'self' 'unsafe-inline'",

  // Admin avatars live in Vercel Blob; data:/blob: cover generated and
  // locally-previewed images.
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",

  "font-src 'self' data:",

  // Client and admin uploads go straight from the browser to Blob storage,
  // so those hosts have to be reachable or every upload fails.
  `connect-src 'self' https://blob.vercel-storage.com https://*.public.blob.vercel-storage.com${
    isDev ? " ws: http://localhost:*" : ""
  }`,

  // Not 'none': the email composer previews a message in an <iframe srcDoc>,
  // which is checked against the parent document's origin.
  "frame-src 'self'",

  "worker-src 'self' blob:",
  "manifest-src 'self'",

  // No plugins, no <base> hijacking, no off-site form posts, no framing.
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",

  // Omitted in development, where the app is served over plain http.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  {
    key: process.env.CSP_REPORT_ONLY === "1"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value: csp,
  },
  // Never let browsers guess MIME types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // This site has no business being embedded in an iframe. Redundant with
  // frame-ancestors above, kept for browsers that predate CSP2.
  { key: "X-Frame-Options", value: "DENY" },
  // Send the origin, not the full URL, to external destinations.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The site uses none of these — say so explicitly.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  /**
   * Renamed post slugs. A published URL is a promise to whoever linked it,
   * and app/sitemap.ts has already handed these to crawlers — so a rename
   * without a redirect turns an indexed page into a 404 rather than moving
   * it. Permanent (308), because these are not coming back.
   */
  async redirects() {
    return [
      {
        // The post argued for a labelled empty frame; the site now renders
        // nothing at all, so both the title and the slug had to change.
        source: "/blog/wed-rather-show-you-an-empty-box",
        destination: "/blog/we-deleted-the-empty-box",
        permanent: true,
      },
    ];
  },

  /**
   * The enquiry form on its own subdomain.
   *
   * The link a client is emailed after enquiring reads
   * `enquiryform.bothmade.studio/<token>` rather than `bothmade.studio/f/<token>`
   * — a shorter, more obviously legitimate address for a link somebody is
   * being asked to click and type answers into.
   *
   * A rewrite rather than a redirect, so the address stays that way in the
   * bar while the same `app/f/[token]` page serves it. Scoped by `has: host`,
   * so nothing on the main domain can be affected by it, and the token
   * pattern is pinned to the 64 hex characters a `shareToken` actually is —
   * without that, a request for `/favicon.ico` on this host would be looked
   * up as a lead.
   *
   * Requires `enquiryform.bothmade.studio` to be added as a domain on the
   * Vercel project; until it is, the canonical `/f/<token>` path still works.
   */
  async rewrites() {
    return [
      {
        source: "/:token([a-f0-9]{32,64})",
        has: [{ type: "host", value: "enquiryform.bothmade.studio" }],
        destination: "/f/:token",
      },
    ];
  },
};

export default nextConfig;
