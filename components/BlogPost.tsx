'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValue,
  useMotionTemplate,
  useMotionValueEvent,
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

    case 'seamDemo':
      return <SeamDemo block={block} />;

    case 'letterFlipDemo':
      return <LetterFlipDemo word={block.word} />;

    case 'cursorDemo':
      return <CursorDemo />;

    case 'scrollProgressDemo':
      return <ScrollProgressDemo />;

    case 'focusListDemo':
      return <FocusListDemo items={block.items} />;
  }
}

/**
 * Same bar as the real ScrollProgress, but driven by useScroll({ container })
 * against a bounded, internally-scrollable box instead of the page.
 */
function ScrollProgressDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      <div className="h-1 bg-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-600 origin-left"
          style={{ scaleX }}
        />
      </div>
      <div ref={containerRef} className="h-56 overflow-y-auto p-6 space-y-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
          scroll this box, not the page
        </p>
        {Array.from({ length: 6 }).map((_, i) => (
          <p key={i} className="text-sm text-white/45 leading-relaxed">
            Line {i + 1} of filler content, just tall enough to make this box scrollable on
            its own so the bar above has something real to track.
          </p>
        ))}
      </div>
    </div>
  );
}

/** A few rows using the real FocusRow primitive, reacting to page scroll like everywhere else it's used. */
function FocusListDemo({ items }: { items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 divide-y divide-white/10 overflow-hidden">
      {items.map((item) => (
        <FocusRow key={item} className="px-6 py-6">
          <p className="text-lg text-white/70">{item}</p>
        </FocusRow>
      ))}
    </div>
  );
}

/**
 * Miniature replay of LuxuryCursor: the same requestAnimationFrame easing
 * loop and lerp trail, but tracking mouse position relative to a bounded
 * box instead of the window, and only rendering while the pointer is
 * actually inside it.
 */
function CursorDemo() {
  const boxRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const box = boxRef.current;
    const dot = dotRef.current;
    const trail = trailRef.current;
    if (!box || !dot || !trail) return;

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return;

    let mouseX = 0;
    let mouseY = 0;
    let trailX = 0;
    let trailY = 0;
    let inside = false;

    const onMove = (e: PointerEvent) => {
      const rect = box.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      if (!inside) {
        inside = true;
        trailX = mouseX;
        trailY = mouseY;
        dot.style.opacity = '1';
        trail.style.opacity = '1';
      }
    };
    const onLeave = () => {
      inside = false;
      dot.style.opacity = '0';
      trail.style.opacity = '0';
    };

    let frame: number;
    const tick = () => {
      trailX += (mouseX - trailX) * 0.18;
      trailY += (mouseY - trailY) * 0.18;
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      trail.style.transform = `translate3d(${trailX}px, ${trailY}px, 0) translate(-50%, -50%)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerleave', onLeave);
    };
  }, [reduceMotion]);

  return (
    <div
      ref={boxRef}
      className="relative h-56 md:h-72 rounded-2xl border border-white/10 bg-white/[0.02] grid place-items-center overflow-hidden cursor-none"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30 pointer-events-none">
        {reduceMotion ? 'motion reduced — demo disabled' : 'move your cursor in here'}
      </p>
      {!reduceMotion && (
        <>
          <div
            ref={dotRef}
            aria-hidden="true"
            className="absolute top-0 left-0 pointer-events-none z-20 w-1.5 h-1.5 rounded-full bg-sky-300 opacity-0"
          />
          <div
            ref={trailRef}
            aria-hidden="true"
            className="absolute top-0 left-0 pointer-events-none z-10 w-9 h-9 rounded-full border border-sky-300/35 opacity-0"
          />
        </>
      )}
    </div>
  );
}

/**
 * Miniature replay of the footer's SeamWordmark: hovering/touching a
 * letter flips it to the other world's treatment, then a timeout reverts
 * it after a beat — same per-letter timer-map pattern as the real thing.
 */
function LetterFlipDemo({ word }: { word: string }) {
  const [flipped, setFlipped] = useState<boolean[]>(() => word.split('').map(() => false));
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const toggle = (i: number) => {
    setFlipped((prev) => prev.map((v, j) => (j === i ? true : v)));
    clearTimeout(timers.current.get(i));
    timers.current.set(
      i,
      setTimeout(() => {
        setFlipped((prev) => prev.map((v, j) => (j === i ? false : v)));
      }, 1200)
    );
  };

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <div className="flex justify-center overflow-hidden py-12 select-none rounded-2xl border border-white/10 bg-white/[0.02]">
      <p className="font-bold leading-none tracking-[-0.03em] whitespace-nowrap" style={{ fontSize: 'clamp(2rem, 8vw, 5rem)' }}>
        {word.split('').map((ch, i) => (
          <motion.span
            key={i}
            onPointerEnter={() => toggle(i)}
            className="inline-block cursor-default"
            whileHover={{ y: -8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 14 }}
            style={
              flipped[i]
                ? {
                    color: 'transparent',
                    backgroundImage: 'linear-gradient(180deg, #fff 30%, #d8b4fe)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                  }
                : {
                    color: 'transparent',
                    WebkitTextStroke: '1.5px rgba(125,211,252,0.8)',
                  }
            }
          >
            {ch}
          </motion.span>
        ))}
      </p>
    </div>
  );
}

/**
 * Miniature replay of SplitHero's draggable seam: a spring chases a target
 * position, a clip-path reveals the left world up to that position, and
 * dragging (pointer or arrow keys) moves the target. Same mechanic, smaller
 * stage — genuinely draggable, not a canned animation.
 */
function SeamDemo({
  block,
}: {
  block: Extract<Block, { type: 'seamDemo' }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const reduceMotion = useReducedMotion();

  const target = useMotionValue(50);
  const seam = useSpring(target, { stiffness: 340, damping: 34, mass: 0.6 });
  const clipPath = useMotionTemplate`inset(0 ${useTransform(seam, (v) => 100 - v)}% 0 0)`;
  const seamLeft = useMotionTemplate`${seam}%`;

  // Mirrored into React state so aria-valuenow actually updates — motion
  // values bypass render, and a slider that always announces "50" is worse
  // than no slider at all.
  const [ariaNow, setAriaNow] = useState(50);
  useMotionValueEvent(seam, 'change', (v) => {
    const rounded = Math.round(v);
    if (rounded !== ariaNow) setAriaNow(rounded);
  });

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    target.set(Math.min(88, Math.max(12, pct)));
  }, [target]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => setFromClientX(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, setFromClientX]);

  const nudge = (delta: number) => target.set(Math.min(88, Math.max(12, target.get() + delta)));

  if (reduceMotion) {
    return (
      <div className="rounded-2xl border border-white/10 overflow-hidden grid grid-cols-2">
        <div className="p-10 text-center font-mono text-sm uppercase tracking-[0.3em]" style={{ background: block.leftColor, color: 'white' }}>
          {block.leftLabel}
        </div>
        <div className="p-10 text-center font-mono text-sm uppercase tracking-[0.3em]" style={{ background: block.rightColor, color: 'white' }}>
          {block.rightLabel}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-64 md:h-80 rounded-2xl overflow-hidden border border-white/10 select-none touch-none"
    >
      {/* right world, base layer */}
      <div
        className="absolute inset-0 grid place-items-center"
        style={{ background: block.rightColor }}
      >
        <p className="font-mono text-sm md:text-base uppercase tracking-[0.4em] text-white/90">
          {block.rightLabel}
        </p>
      </div>

      {/* left world, clipped */}
      <motion.div className="absolute inset-0 grid place-items-center" style={{ clipPath, background: block.leftColor }}>
        <p className="font-mono text-sm md:text-base uppercase tracking-[0.4em] text-white/90">
          {block.leftLabel}
        </p>
      </motion.div>

      {/* handle */}
      <motion.div className="absolute top-0 bottom-0 z-30 w-px bg-white/70" style={{ left: seamLeft }}>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.focus();
            setDragging(true);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 12 : 4;
            if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step); }
          }}
          role="slider"
          aria-label={`Reveal ${block.leftLabel} or ${block.rightLabel}`}
          aria-valuemin={12}
          aria-valuemax={88}
          aria-valuenow={ariaNow}
          aria-valuetext={`${ariaNow}% ${block.leftLabel}, ${100 - ariaNow}% ${block.rightLabel}`}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/30 bg-black/60 backdrop-blur-md grid place-items-center cursor-ew-resize touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <span className="text-white/70 text-[10px] tracking-[0.2em] font-mono">↔</span>
        </button>
      </motion.div>
    </div>
  );
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
