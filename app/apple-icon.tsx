import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * The home-screen mark. iOS rounds the corners itself, so this renders a
 * full-bleed tile: the seam splitting B from M, with the line of light.
 */
export default function AppleIcon() {
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
            background:
              'radial-gradient(circle at 30% 40%, #062a4a 0%, #02060d 75%)',
            color: '#7dd3fc',
            fontSize: 104,
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
            background:
              'radial-gradient(circle at 70% 40%, #2b1148 0%, #06030c 75%)',
            color: '#ffffff',
            fontSize: 104,
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
    size
  );
}
