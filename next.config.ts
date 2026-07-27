import type { NextConfig } from "next";

/**
 * Baseline hardening. A full Content-Security-Policy is deliberately not
 * here yet — Next's inline runtime needs nonce plumbing to do CSP right,
 * and a half-configured CSP breaks pages silently. Add it as its own task
 * before launch if the threat model warrants it.
 */
const securityHeaders = [
  // Never let browsers guess MIME types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // This site has no business being embedded in an iframe.
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
