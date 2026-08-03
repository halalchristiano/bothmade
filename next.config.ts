import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

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
};

export default nextConfig;
