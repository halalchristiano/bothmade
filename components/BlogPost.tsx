'use client';

import { useRef } from 'react';
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { LuxuryCursor } from '@/components/LuxuryCursor';
import { ScrollProgress } from '@/components/ScrollProgress';
import { CountUp, FocusRow, ScrubText, GridBackdrop } from '@/components/ui';
import { formatBlogDate, type BlogPost, type Block } from '@/lib/blog';

const ACCENT_HEX: Record<BlogPost['accent'], { from: string; to: string; text: string }> = {
  sky: { from: '#0ea5e9', to: '#0c2f52', text: 'rgb(125 211 252)' },
  indigo: { from: '#6366f1', to: '#1e1b4b', text: 'rgb(165 180 252)' },
  purple: { from: '#a855f7', to: '#3b0764', text: 'rgb(216 180 254)' },
};

export function BlogPostPage({
  post,
  prev,
  next,
}: {
  post: BlogPost;
  prev?: BlogPost;
  next?: BlogPost;
}) {
  const accent = ACCENT_HEX[post.accent];
  let paragraphIndex = -1;

  return (
    <main className="relative bg-[#05030a] text-white">
      <ScrollProgress />
      <LuxuryCursor />
      <Nav />

      {/* Hero */}
      <section className="relative px-6 pt-40 pb-24 overflow-hidden">
        <GridBackdrop rgb={hexToRgb(accent.from)} />
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 20% 20%, ${accent.from}22 0%, transparent 55%)`,
          }}
        />

        <div className="relative max-w-3xl mx-auto">
          <motion.div
            className="mb-8 flex items-center gap-4 flex-wrap"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link
              href="/blog"
              className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/40 hover:text-white transition-colors"
            >
              ← Blog
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.35em]" style={{ color: accent.text }}>
              {post.tag}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/30">
              {formatBlogDate(post.date)} · {post.readMinutes} min read
            </span>
          </motion.div>

          <motion.h1
            className="font-bold leading-[0.95] tracking-[-0.03em]"
            style={{ fontSize: 'clamp(2.25rem, 7vw, 5.5rem)' }}
            initial={{ opacity: 0, y: '0.3em' }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {post.title}
          </motion.h1>

          <motion.p
            className="mt-8 max-w-xl text-lg leading-relaxed text-white/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            {post.dek}
          </motion.p>
        </div>
      </section>

      {/* Body */}
      <article className="relative px-6 pb-32">
        <div className="max-w-3xl mx-auto space-y-14">
          {post.body.map((block, i) => {
            if (block.type === 'p') paragraphIndex += 1;
            return (
              <BlockRenderer
                key={i}
                block={block}
                accent={accent}
                isFirstParagraph={block.type === 'p' && paragraphIndex === 0}
              />
            );
          })}
        </div>
      </article>

      {/* Prev / next */}
      {(prev || next) && (
        <section className="relative border-t border-white/10">
          <div className="max-w-3xl mx-auto grid sm:grid-cols-2">
            {prev ? (
              <AdjacentLink post={prev} direction="prev" />
            ) : (
              <div className="hidden sm:block" />
            )}
            {next ? (
              <AdjacentLink post={next} direction="next" />
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function BlockRenderer({
  block,
  accent,
  isFirstParagraph,
}: {
  block: Block;
  accent: { from: string; to: string; text: string };
  isFirstParagraph: boolean;
}) {
  switch (block.type) {
    case 'p':
      return (
        <motion.p
          className="text-lg leading-[1.75] text-white/70"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 0.5 }}
          style={
            isFirstParagraph
              ? ({ '--drop-color': accent.text } as React.CSSProperties)
              : undefined
          }
        >
          {isFirstParagraph ? (
            <>
              <span
                aria-hidden="true"
                className="float-left mr-3 mt-1 font-bold leading-[0.8]"
                style={{ fontSize: '4.5rem', color: accent.text }}
              >
                {block.text.charAt(0)}
              </span>
              {block.text.slice(1)}
            </>
          ) : (
            block.text
          )}
        </motion.p>
      );

    case 'statement':
      return (
        <ScrubText
          text={block.text}
          className="font-medium leading-[1.35] tracking-tight"
          style={{ fontSize: 'clamp(1.35rem, 3.2vw, 2.25rem)' }}
        />
      );

    case 'heading':
      return (
        <FocusRow className="pt-8 border-t border-white/10">
          <h2 className="font-mono text-xs uppercase tracking-[0.4em] text-white/40">
            {block.text}
          </h2>
        </FocusRow>
      );

    case 'quote':
      return (
        <motion.figure
          className="relative border-l-2 pl-8 py-2"
          style={{ borderColor: accent.from }}
          initial={{ opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 0.5 }}
        >
          <blockquote
            className="font-medium leading-[1.4] tracking-tight"
            style={{ fontSize: 'clamp(1.25rem, 2.8vw, 2rem)' }}
          >
            “{block.text}”
          </blockquote>
          {block.attribution && (
            <figcaption className="mt-4 font-mono text-xs uppercase tracking-[0.3em] text-white/40">
              {block.attribution}
            </figcaption>
          )}
        </motion.figure>
      );

    case 'stats':
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-4">
          {block.items.map((m, idx) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              viewport={{ once: true }}
            >
              <p
                className="font-bold leading-none mb-3"
                style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', color: accent.text }}
              >
                <CountUp value={m.value} />
              </p>
              <p className="text-sm text-white/45">{m.label}</p>
            </motion.div>
          ))}
        </div>
      );

    case 'code':
      return (
        <motion.pre
          className="overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] p-6 font-mono text-sm leading-relaxed text-sky-100/80"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 0.5 }}
        >
          {block.language && (
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
              {block.language}
            </p>
          )}
          <code>{block.code}</code>
        </motion.pre>
      );

    case 'stackDemo':
      return <StackDemo panels={block.panels} accent={accent} />;
  }
}

/**
 * A miniature, self-contained replay of the ServiceList sheet-presentation
 * technique — scoped to its own local scroll region instead of the full
 * page. Panels rise from the bottom, dock full-bleed, and get buried by the
 * next one as you scroll past, driven by a local scrollYProgress rather
 * than any global scroll state, so it can live safely inside an article.
 */
function StackDemo({
  panels,
  accent,
}: {
  panels: { label: string; from: string; to: string }[];
  accent: { from: string; to: string; text: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 150, damping: 30, mass: 0.4 });

  if (reduceMotion) {
    return (
      <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/10">
        {panels.map((p) => (
          <div
            key={p.label}
            className="p-8 text-center font-mono text-xs uppercase tracking-[0.3em] text-white/60"
            style={{ background: `linear-gradient(135deg, ${p.from}33, ${p.to}66)` }}
          >
            {p.label}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative" style={{ height: `${panels.length * 90}vh` }}>
      <div className="sticky top-24 h-[60vh] rounded-2xl overflow-hidden border border-white/10">
        {panels.map((panel, i) => (
          <DemoSheet key={panel.label} panel={panel} index={i} total={panels.length} progress={progress} />
        ))}
        <div className="absolute bottom-4 inset-x-0 z-40 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
          scroll to stack them
        </div>
      </div>
      <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: accent.text }}>
        live demo — same technique as the homepage
      </p>
    </div>
  );
}

function DemoSheet({
  panel,
  index,
  total,
  progress,
}: {
  panel: { label: string; from: string; to: string };
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const inStart = (index - 1) / (total - 1) + 0.05;
  const inEnd = index / (total - 1) - 0.03;
  const outStart = index / (total - 1) + 0.05;
  const outEnd = (index + 1) / (total - 1) - 0.03;

  const y = useTransform(
    progress,
    isFirst ? [0, 0.0001] : [inStart, Math.max(inEnd, inStart + 0.01)],
    isFirst ? ['0%', '0%'] : ['104%', '0%']
  );
  const buriedScale = useTransform(
    progress,
    isLast ? [0, 1] : [outStart, outEnd],
    isLast ? [1, 1] : [1, 0.94]
  );
  const dim = useTransform(
    progress,
    isLast ? [0, 1] : [outStart, outEnd],
    isLast ? [0, 0] : [0, 0.6]
  );

  return (
    <motion.div className="absolute inset-0" style={{ scale: buriedScale, zIndex: 10 + index }}>
      <motion.div
        className="absolute inset-0 grid place-items-center"
        style={{
          y,
          background: `linear-gradient(135deg, ${panel.from}, ${panel.to})`,
        }}
      >
        <p className="font-mono text-sm uppercase tracking-[0.4em] text-white/90">{panel.label}</p>
      </motion.div>
      <motion.div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: dim }} />
    </motion.div>
  );
}

function AdjacentLink({ post, direction }: { post: BlogPost; direction: 'prev' | 'next' }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block px-6 py-16 relative overflow-hidden border-t border-white/10 sm:border-t-0 first:border-t-0"
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            direction === 'prev'
              ? 'linear-gradient(270deg, transparent 65%, rgba(255,255,255,0.04) 100%)'
              : 'linear-gradient(90deg, transparent 65%, rgba(255,255,255,0.04) 100%)',
        }}
      />
      <div className={`relative max-w-sm ${direction === 'next' ? 'sm:ml-auto sm:text-right' : ''}`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-white/40 mb-4">
          {direction === 'prev' ? '← Previous' : 'Next →'}
        </p>
        <h3
          className="font-bold tracking-tight text-white/50 group-hover:text-white transition-colors duration-500"
          style={{ fontSize: 'clamp(1.25rem, 3vw, 1.75rem)' }}
        >
          {post.title}
        </h3>
      </div>
    </Link>
  );
}
