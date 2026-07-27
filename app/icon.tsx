import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** The seam, reduced to its smallest form: half wireframe, half solid. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#05030a',
        }}
      >
        <div
          style={{
            width: '50%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#02060d',
            color: '#7dd3fc',
            fontSize: 22,
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
            background: '#1f0d36',
            color: '#ffffff',
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          M
        </div>
      </div>
    ),
    size
  );
}
