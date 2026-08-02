import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';

/**
 * A larger, email-safe render of the same seam mark used for the site
 * favicon/apple-icon (app/icon.tsx) — split B|M panels with the vertical
 * line of light — so outbound email carries the same identity as the site
 * instead of a plain text wordmark. Served as its own route (rather than
 * reusing the icon size) because email headers want ~64-96px, not 32px.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
        <div
          style={{
            width: '50%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at 30% 40%, #062a4a 0%, #02060d 75%)',
            color: '#7dd3fc',
            fontSize: 52,
            fontWeight: 800,
          }}
        >
          B
        </div>
        <div
          style={{
            width: '50%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at 70% 40%, #2b1148 0%, #06030c 75%)',
            color: '#ffffff',
            fontSize: 52,
            fontWeight: 800,
          }}
        >
          M
        </div>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 2,
            height: '100%',
            background: 'rgba(255,255,255,0.9)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { width: 96, height: 96 }
  );
}
