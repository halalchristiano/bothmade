import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Bothmade — web and native Apple development studio';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const WORD = 'BOTHMADE';
const SEAM = 600;

/** The share card runs the same split as the hero: one word, two identities. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#05030a',
        }}
      >
        {/* native layer — full width, sits underneath */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size.width,
            height: size.height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(ellipse at 70% 45%, #1f0d36 0%, #05030a 65%)',
          }}
        >
          <div style={{ fontSize: 132, fontWeight: 800, color: '#ffffff', letterSpacing: -4 }}>
            {WORD}
          </div>
        </div>

        {/* web layer — identical geometry, clipped at the seam */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: SEAM,
            height: size.height,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: size.width,
              height: size.height,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(ellipse at 30% 45%, #062a4a 0%, #02060d 65%)',
            }}
          >
            <div style={{ fontSize: 132, fontWeight: 800, color: '#7dd3fc', letterSpacing: -4 }}>
              {WORD}
            </div>
          </div>
        </div>

        {/* the seam */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: SEAM,
            width: 2,
            height: size.height,
            background: 'rgba(255,255,255,0.85)',
          }}
        />

        {/* corner labels */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: 72,
            display: 'flex',
            fontSize: 22,
            letterSpacing: 8,
            color: 'rgba(125,211,252,0.75)',
          }}
        >
          FOR THE BROWSER
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 56,
            right: 72,
            display: 'flex',
            fontSize: 22,
            letterSpacing: 8,
            color: 'rgba(216,180,254,0.75)',
          }}
        >
          FOR THE DEVICE
        </div>

        <div
          style={{
            position: 'absolute',
            top: 52,
            left: 72,
            display: 'flex',
            fontSize: 26,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.9)',
          }}
        >
          bothmade
        </div>
      </div>
    ),
    size
  );
}
