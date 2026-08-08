'use client';

import { useEffect } from 'react';

/**
 * The failure app/error.tsx cannot catch.
 *
 * `error.js` wraps the pages and nested layouts below it — not the layout in
 * its own segment. So a throw in the root layout goes straight past the
 * branded boundary and hands the visitor Next's unstyled default, which is
 * the one screen that file's own comment says a studio selling polish can
 * never afford to show. That was the only outcome available for it, because
 * this file did not exist.
 *
 * It is deliberately unlike every other page here, because of what is not
 * available to it:
 *
 *  - It replaces the root layout, so it has to render its own <html> and
 *    <body>.
 *  - Global styles do not reach it. Every rule below is inline for that
 *    reason — a Tailwind class here is a class with no stylesheet behind it,
 *    which is how a "branded" fallback ends up as black text on white after
 *    all. Same reason there is no <Nav />: it is a component from a tree that
 *    has just proven it cannot render.
 *  - Error boundaries are Client Components, so `metadata` is not supported.
 *    React's own <title> is the documented way to set one.
 *
 * The digest is shown for the same reason it is shown on the other two
 * boundaries: in production a Server Component's real message is replaced by
 * a generic one on purpose, and this hash is the only thing that ties what
 * the visitor saw to what the server logged.
 */
export default function GlobalError({
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
    <html lang="en">
      <head>
        <title>Something went wrong — Bothmade</title>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#05030a',
          color: '#ffffff',
          fontFamily:
            'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1.5rem',
        }}
      >
        <div style={{ maxWidth: '56rem', margin: '0 auto', width: '100%' }}>
          <p
            style={{
              margin: '0 0 2rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.45em',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            something broke
          </p>

          <h1
            style={{
              margin: 0,
              fontWeight: 700,
              lineHeight: 0.9,
              letterSpacing: '-0.03em',
              fontSize: 'clamp(3rem, 12vw, 9rem)',
            }}
          >
            <span style={{ color: 'rgba(216,180,254,0.85)' }}>Un</span>
            <span style={{ color: '#ffffff' }}>made.</span>
          </h1>

          <p
            style={{
              margin: '2.5rem 0 0',
              maxWidth: '28rem',
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            Something went wrong on our side, before the page could even start. It&rsquo;s
            logged, and trying again usually works.
          </p>

          <div style={{ marginTop: '3rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <button
              onClick={() => retry()}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.06)',
                color: '#ffffff',
                padding: '0.85rem 1.6rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.6)',
                padding: '0.85rem 1.6rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Back home
            </a>
          </div>

          {error.digest && (
            <p
              style={{
                marginTop: '3rem',
                fontSize: '0.75rem',
                color: 'rgba(255,255,255,0.3)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              Reference {error.digest} — quote this if you write to us.
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
