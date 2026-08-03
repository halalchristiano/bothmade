import { ImageResponse } from 'next/og';
import { BLOG_POSTS, getBlogPost } from '@/lib/blog';

export const runtime = 'nodejs';
export const alt = 'Bothmade Blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return BLOG_POSTS.map(({ slug }) => ({ slug }));
}

const ACCENT_COLORS: Record<string, string> = {
  sky: '#7dd3fc',
  indigo: '#a5b4fc',
  purple: '#d8b4fe',
};

/**
 * Per-post share card — same dark-field treatment as the site default
 * (app/opengraph-image.tsx), but swaps the wordmark for the post's own
 * title and tag so each article gets a distinct, still-on-brand image
 * instead of every post sharing one generic card.
 */
export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  const accent = post ? ACCENT_COLORS[post.accent] ?? '#7dd3fc' : '#7dd3fc';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          background: '#05030a',
          padding: '72px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size.width,
            height: size.height,
            display: 'flex',
            background: `radial-gradient(ellipse at 75% 20%, ${accent}22 0%, #05030a 60%)`,
          }}
        />
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          bothmade
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {post ? (
            <div
              style={{
                display: 'flex',
                fontSize: 22,
                letterSpacing: 6,
                color: accent,
                textTransform: 'uppercase',
              }}
            >
              {post.tag}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              fontSize: 64,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: -2,
              lineHeight: 1.1,
              maxWidth: 1000,
            }}
          >
            {post ? post.title : 'Bothmade Blog'}
          </div>
        </div>
      </div>
    ),
    size
  );
}
