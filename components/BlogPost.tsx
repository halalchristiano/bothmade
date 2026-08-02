'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  motion,
  AnimatePresence,
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
import { BASE_SERVICES, formatCents, type BaseService } from '@/lib/pricing';

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
          <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2">
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

    case 'seamIndicatorDemo':
      return <SeamIndicatorDemo />;

    case 'introDemo':
      return <IntroDemo />;

    case 'scrollCompareDemo':
      return <ScrollCompareDemo />;

    case 'processDemo':
      return <ProcessDemo phases={block.phases} />;

    case 'stackChipsDemo':
      return <StackChipsDemo columns={block.columns} />;

    case 'pricingDemo':
      return <PricingDemo />;

    case 'springboardDemo':
      return <SpringboardDemo />;

    case 'kineticWordDemo':
      return <KineticWordDemo word={block.word} />;

    case 'flyThroughDemo':
      return <FlyThroughDemo words={block.words} />;

    case 'parallaxDemo':
      return <ParallaxDemo />;

    case 'supportTimelineDemo':
      return <SupportTimelineDemo milestones={block.milestones} />;

    case 'reducedMotionToggleDemo':
      return <ReducedMotionToggleDemo />;

    case 'kineticPlaygroundDemo':
      return <KineticPlaygroundDemo />;
  }
}

/** Milestones arrive in sequence via whileInView stagger, with a connecting line drawing behind them via scaleX. */
function SupportTimelineDemo({ milestones }: { milestones: { label: string; desc: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="rounded-2xl border border-white/10 p-6 md:p-10">
      <div className="relative">
        <div className="absolute top-[10px] left-0 right-0 h-px bg-white/10" />
        <motion.div
          className="absolute top-[10px] left-0 h-px bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 origin-left"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-6">
          {milestones.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10% 0px' }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
            >
              <span className="block w-[10px] h-[10px] rounded-full bg-white mb-4" />
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40 mb-1">
                {m.label}
              </p>
              <p className="text-sm text-white/55 leading-relaxed">{m.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A toggle drives the same animated card two ways: full motion, or the plain instant-state fallback prefers-reduced-motion gets on the real site. */
function ReducedMotionToggleDemo() {
  const [simReduced, setSimReduced] = useState(false);
  const [pulse, setPulse] = useState(0);

  return (
    <div className="rounded-2xl border border-white/10 p-6 md:p-8">
      <div className="flex items-center justify-between mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
          {simReduced ? 'simulating: prefers-reduced-motion' : 'simulating: normal motion'}
        </p>
        <button
          onClick={() => setSimReduced((v) => !v)}
          className={`relative w-12 h-7 rounded-full border transition-colors duration-300 ${
            simReduced ? 'bg-sky-400/30 border-sky-400/60' : 'bg-white/5 border-white/20'
          }`}
          aria-pressed={simReduced}
          aria-label="Toggle simulated reduced motion"
        >
          <motion.span
            className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white"
            animate={{ x: simReduced ? 20 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        </button>
      </div>

      <button
        onClick={() => setPulse((p) => p + 1)}
        className="w-full rounded-xl border border-white/10 py-8 text-sm text-white/60 hover:text-white transition-colors"
      >
        tap to trigger the card below
      </button>

      <div className="mt-6 h-20 grid place-items-center overflow-hidden">
        {simReduced ? (
          <div key={pulse} className="w-16 h-16 rounded-xl bg-gradient-to-br from-sky-400 to-purple-500 opacity-100" />
        ) : (
          <motion.div
            key={pulse}
            className="w-16 h-16 rounded-xl bg-gradient-to-br from-sky-400 to-purple-500"
            initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          />
        )}
      </div>
    </div>
  );
}

/** Same weight-follows-cursor mechanic as KineticWordDemo, but the word comes from a live text input instead of a fixed prop. */
function KineticPlaygroundDemo() {
  const [word, setWord] = useState('HELLO');
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const host = ref.current;
    if (!host || reduceMotion) return;
    const letters = Array.from(host.children) as HTMLSpanElement[];

    let mx = -9999;
    let my = -9999;
    let live = false;
    let lastMove = 0;

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      live = true;
      lastMove = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let frame: number;
    const tick = (now: number) => {
      const idle = !live || now - lastMove > 2600;
      for (let i = 0; i < letters.length; i++) {
        let t: number;
        if (idle) {
          t = Math.max(0, Math.sin(now / 650 - i * 0.5)) * 0.5;
        } else {
          const r = letters[i].getBoundingClientRect();
          const d = Math.hypot(mx - (r.left + r.width / 2), my - (r.top + r.height / 2));
          const raw = Math.max(0, 1 - d / 300);
          t = raw * raw * (3 - 2 * raw);
        }
        letters[i].style.fontVariationSettings = `'wght' ${Math.round(260 + t * 640)}`;
        letters[i].style.color = `rgba(${186 + t * 69}, ${230 + t * 25}, 252, ${0.2 + t * 0.8})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
    };
  }, [reduceMotion, word]);

  const display = word.trim() === '' ? 'HELLO' : word.toUpperCase().slice(0, 16);

  return (
    <div className="rounded-2xl border border-white/10 p-6 md:p-10">
      <input
        type="text"
        value={word}
        onChange={(e) => setWord(e.target.value)}
        placeholder="Type a word…"
        maxLength={16}
        aria-label="Word to render with the kinetic weight effect"
        className="w-full mb-8 bg-transparent border-0 border-b border-white/20 pb-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50 transition-colors"
      />

      <div className="grid place-items-center min-h-24">
        {reduceMotion ? (
          <span className="font-bold text-sky-300" style={{ fontSize: 'clamp(1.75rem, 7vw, 3.5rem)' }}>
            {display}
          </span>
        ) : (
          <span
            ref={ref}
            aria-label={display}
            className="block select-none font-bold leading-none tracking-[-0.03em] whitespace-nowrap"
            style={{ fontSize: 'clamp(1.75rem, 7vw, 3.5rem)' }}
          >
            {display.split('').map((ch, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="inline-block"
                style={{
                  fontVariationSettings: "'wght' 260",
                  color: 'rgba(186,230,252,0.2)',
                  willChange: 'font-variation-settings, color',
                }}
              >
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Scaled replay of VisionHero's depth scene: pointer position within the
 * bounded stage drives rotateX/rotateY on a transform-style: preserve-3d
 * container; a few child elements sit at different translateZ depths so
 * the whole thing tilts as one rigid 3D diorama, not flat layers sliding.
 */
function ParallaxDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [9, -9]), { stiffness: 90, damping: 20 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-14, 14]), { stiffness: 90, damping: 20 });

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => {
    px.set(0);
    py.set(0);
  };

  if (reduceMotion) {
    return (
      <div className="rounded-2xl border border-white/10 p-10 grid place-items-center h-64 md:h-80">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/40">
          motion reduced — static
        </p>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className="relative h-64 md:h-80 rounded-2xl border border-white/10 overflow-hidden bg-[#05030a] grid place-items-center"
      style={{ perspective: '1000px' }}
    >
      <motion.div
        className="relative"
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
      >
        <div className="absolute" style={{ transform: 'translate3d(-90px, -50px, -80px)' }}>
          <div className="w-20 h-14 rounded-xl border border-white/15" style={{ background: 'linear-gradient(140deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))', backdropFilter: 'blur(10px)' }} />
        </div>
        <div className="absolute" style={{ transform: 'translate3d(70px, 40px, -40px)' }}>
          <div className="w-16 h-24 rounded-xl border border-white/15" style={{ background: 'linear-gradient(140deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))', backdropFilter: 'blur(10px)' }} />
        </div>
        <div
          className="relative rounded-2xl border border-white/20 px-6 py-5"
          style={{
            transform: 'translateZ(50px)',
            background: 'linear-gradient(150deg, rgba(255,255,255,0.13), rgba(255,255,255,0.04))',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 30px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-purple-200/80">
            move your cursor
          </p>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Scaled replay of WebHero's fly-through Act sequence: each word owns a
 * slice of the local scroll range and scales from ~0.55x up through 1x to
 * ~9x while fading, so scrolling through the bounded stage reads as flying
 * through one word into the next.
 */
function FlyThroughDemo({ words }: { words: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.3 });

  if (reduceMotion) {
    return (
      <div className="rounded-2xl border border-white/10 p-10 space-y-6">
        {words.map((w) => (
          <p key={w} className="font-bold text-sky-100" style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}>
            {w}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-[220vh] rounded-2xl border border-white/10 overflow-hidden">
      <div className="sticky top-24 h-72 md:h-80 overflow-hidden bg-[#02060d]">
        <motion.p
          className="absolute bottom-4 inset-x-0 z-20 text-center font-mono text-[10px] uppercase tracking-[0.35em] text-white/30"
          style={{ opacity: useTransform(progress, [0, 0.08], [1, 0]) }}
        >
          scroll — flying through
        </motion.p>
        {words.map((word, i) => (
          <FlyAct key={word} index={i} total={words.length} progress={progress} word={word} />
        ))}
      </div>
    </div>
  );
}

function FlyAct({
  index,
  total,
  progress,
  word,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  word: string;
}) {
  const slotSize = 1 / total;
  const enterStart = index === 0 ? 0 : (index - 0.1) * slotSize;
  const settled = index === 0 ? 0 : (index + 0.05) * slotSize;
  const exitStart = (index + 0.75) * slotSize;
  const exitEnd = Math.min(1, (index + 1) * slotSize);
  const last = index === total - 1;

  const scale = useTransform(
    progress,
    [enterStart, settled, exitStart, exitEnd],
    index === 0 ? [1, 1, 1, 9] : last ? [0.55, 1, 1, 1] : [0.55, 1, 1, 9]
  );
  const opacity = useTransform(
    progress,
    [enterStart, Math.min(settled, enterStart + 0.03), exitStart, Math.min(exitEnd, exitStart + 0.05)],
    index === 0 ? [1, 1, 1, 0] : last ? [0, 1, 1, 1] : [0, 1, 1, 0]
  );

  return (
    <div className="absolute inset-0 grid place-items-center pointer-events-none">
      <motion.p
        style={{ scale, opacity, fontSize: 'clamp(2rem, 9vw, 5rem)' }}
        className="will-change-transform font-bold leading-none tracking-[-0.03em] whitespace-nowrap text-sky-100"
      >
        {word}
      </motion.p>
    </div>
  );
}

/**
 * Miniature replay of WebHero's KineticWord: each letter's
 * font-variation-settings weight and color track proximity to the
 * pointer on an rAF loop; when the pointer's been still past a
 * threshold, an idle sine wave takes over instead.
 */
function KineticWordDemo({ word }: { word: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const host = ref.current;
    if (!host || reduceMotion) return;
    const letters = Array.from(host.children) as HTMLSpanElement[];

    let mx = -9999;
    let my = -9999;
    let live = false;
    let lastMove = 0;

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      live = true;
      lastMove = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let frame: number;
    const tick = (now: number) => {
      const idle = !live || now - lastMove > 2600;
      for (let i = 0; i < letters.length; i++) {
        let t: number;
        if (idle) {
          t = Math.max(0, Math.sin(now / 650 - i * 0.5)) * 0.5;
        } else {
          const r = letters[i].getBoundingClientRect();
          const d = Math.hypot(mx - (r.left + r.width / 2), my - (r.top + r.height / 2));
          const raw = Math.max(0, 1 - d / 300);
          t = raw * raw * (3 - 2 * raw);
        }
        letters[i].style.fontVariationSettings = `'wght' ${Math.round(260 + t * 640)}`;
        letters[i].style.color = `rgba(${186 + t * 69}, ${230 + t * 25}, 252, ${0.2 + t * 0.8})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
    };
  }, [reduceMotion]);

  return (
    <div className="rounded-2xl border border-white/10 p-10 md:p-16 grid place-items-center overflow-hidden">
      {reduceMotion ? (
        <span className="font-bold text-sky-300" style={{ fontSize: 'clamp(2rem, 8vw, 4rem)' }}>
          {word}
        </span>
      ) : (
        <span
          ref={ref}
          aria-label={word}
          className="block select-none font-bold leading-none tracking-[-0.03em] whitespace-nowrap"
          style={{ fontSize: 'clamp(2rem, 8vw, 4rem)' }}
        >
          {word.split('').map((ch, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="inline-block"
              style={{
                fontVariationSettings: "'wght' 260",
                color: 'rgba(186,230,252,0.2)',
                willChange: 'font-variation-settings, color',
              }}
            >
              {ch}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

type Rect = { top: number; left: number; width: number; height: number };

const DEMO_APPS = [
  { label: 'Ridgeline', glyph: '⛰', from: '#4f46e5', to: '#1e1b4b' },
  { label: 'Cadence', glyph: '◷', from: '#0ea5e9', to: '#0c2f52' },
  { label: 'Ledger', glyph: '◧', from: '#059669', to: '#052e26' },
  { label: 'Signal', glyph: '◉', from: '#e11d48', to: '#4c0519' },
];

/**
 * Scaled replay of IOSHero's launch transition: tapping an icon measures
 * its rect relative to the bounded stage, then AnimatePresence animates a
 * panel from that exact rect to fill the stage. Same technique, smaller
 * container, tap "back" to collapse it again instead of a real navigation.
 */
function SpringboardDemo() {
  const [launching, setLaunching] = useState<Rect | null>(null);
  const [open, setOpen] = useState(false);
  const [openLabel, setOpenLabel] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const launch = (e: React.MouseEvent<HTMLButtonElement>, label: string) => {
    const el = e.currentTarget.getBoundingClientRect();
    const host = stageRef.current?.getBoundingClientRect();
    if (!host) return;
    setLaunching({ top: el.top - host.top, left: el.left - host.left, width: el.width, height: el.height });
    setOpen(true);
    setOpenLabel(label);
  };

  return (
    <div
      ref={stageRef}
      className="relative h-72 md:h-80 rounded-2xl border border-white/10 overflow-hidden bg-[radial-gradient(ellipse_at_50%_20%,#221a4d_0%,#07050f_60%)]"
    >
      <div className="relative h-full flex flex-col items-center justify-center gap-6 px-6">
        <motion.p
          className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30"
          animate={{ opacity: open ? 0 : 1 }}
        >
          tap an app to open
        </motion.p>

        <motion.div
          className="grid grid-cols-4 gap-4 sm:gap-6"
          animate={
            open
              ? { scale: 1.08, opacity: 0, filter: 'blur(6px)' }
              : { scale: 1, opacity: 1, filter: 'blur(0px)' }
          }
          transition={{ duration: 0.5, ease: [0.32, 0, 0.2, 1] }}
        >
          {DEMO_APPS.map((app) => (
            <button
              key={app.label}
              onClick={(e) => launch(e, app.label)}
              aria-label={`Open ${app.label}`}
              className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-[22%] grid place-items-center text-xl text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-200 active:scale-90 hover:scale-105"
              style={{ background: `linear-gradient(150deg, ${app.from}, ${app.to})` }}
            >
              <span className="relative">{app.glyph}</span>
            </button>
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {open && launching && !reduceMotion && (
          <motion.div
            className="absolute z-20 overflow-hidden bg-[#07050f] grid place-items-center"
            initial={{ ...launching, borderRadius: '22%' }}
            animate={{ top: 0, left: 0, width: '100%', height: '100%', borderRadius: 0 }}
            transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
          >
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              onClick={() => { setOpen(false); setLaunching(null); }}
              className="absolute inset-0 grid place-items-center text-white/70 font-mono text-xs uppercase tracking-[0.3em]"
            >
              {openLabel} — tap to go back
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {open && reduceMotion && (
        <div className="absolute inset-0 z-20 bg-[#07050f] grid place-items-center">
          <button
            onClick={() => { setOpen(false); setLaunching(null); }}
            className="text-white/70 font-mono text-xs uppercase tracking-[0.3em]"
          >
            {openLabel} — tap to go back
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Live pricing demo reading BASE_SERVICES straight from lib/pricing.ts —
 * the exact same data backing /start and Stripe checkout. Selecting a
 * service springs the price from its old value to its new one instead of
 * cutting, and formats through the same formatCents used everywhere else.
 */
function PricingDemo() {
  const [selected, setSelected] = useState<BaseService>('website');
  const reduceMotion = useReducedMotion();

  const targetCents = BASE_SERVICES[selected].price;
  const spring = useSpring(targetCents, { stiffness: 90, damping: 20, mass: 0.6 });
  const [display, setDisplay] = useState(formatCents(targetCents));

  useEffect(() => {
    spring.set(targetCents);
  }, [targetCents, spring]);

  useMotionValueEvent(spring, 'change', (v) => {
    setDisplay(formatCents(Math.round(v)));
  });

  const entries = Object.entries(BASE_SERVICES) as [BaseService, (typeof BASE_SERVICES)[BaseService]][];

  return (
    <div className="rounded-2xl border border-white/10 p-6 md:p-8">
      <div className="flex flex-wrap gap-2 mb-8">
        {entries.map(([key, svc]) => (
          <button
            key={key}
            onClick={() => setSelected(key)}
            className={`rounded-full border px-4 py-2 text-sm transition-all duration-300 ${
              selected === key
                ? 'border-sky-400/70 text-white bg-sky-400/10'
                : 'border-white/12 text-white/50 hover:text-white hover:border-white/30'
            }`}
          >
            {svc.label}
          </button>
        ))}
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30 mb-2">
        starting price
      </p>
      <p
        className="font-bold tabular-nums text-white mb-6"
        style={{ fontSize: 'clamp(2.5rem, 7vw, 4rem)' }}
      >
        {reduceMotion ? formatCents(targetCents) : display}
      </p>

      <p className="text-sm text-white/50 leading-relaxed max-w-lg">
        {BASE_SERVICES[selected].description}
      </p>
    </div>
  );
}

/** Scaled replay of ServicePage's stack-chip grid: two-axis stagger (column + per-chip) plus a hover lift. */
function StackChipsDemo({ columns }: { columns: { heading: string; items: string[] }[] }) {
  return (
    <div className="rounded-2xl border border-white/10 p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-10">
      {columns.map((col, idx) => (
        <motion.div
          key={col.heading}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.08, duration: 0.5 }}
          viewport={{ once: true }}
        >
          <h4 className="font-mono text-[10px] uppercase tracking-[0.35em] mb-4 text-sky-300/60">
            {col.heading}
          </h4>
          <ul className="flex flex-wrap gap-2.5">
            {col.items.map((li, i) => (
              <motion.li
                key={li}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 + i * 0.05 }}
                viewport={{ once: true }}
                className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/60 transition-all duration-300 hover:text-white hover:-translate-y-0.5 hover:border-sky-400/60"
              >
                {li}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Scaled replay of ProcessTimeline: whileInView card reveals (viewport:
 * { once: false }, so they replay on re-entry) plus a scroll-derived
 * progress bar underneath, tracking the same bounded section.
 */
function ProcessDemo({ phases }: { phases: { num: string; title: string; tag: string }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.8', 'end 0.4'],
  });
  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <div ref={containerRef} className="rounded-2xl border border-white/10 p-6 md:p-8">
      <div className="space-y-6">
        {phases.map((phase, i) => (
          <motion.div
            key={phase.num}
            className="border-l-2 border-white/20 pl-6 py-2"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            viewport={{ once: false, margin: '-15% 0px' }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40 mb-1">
              {phase.num} · {phase.tag}
            </p>
            <h4 className="text-xl font-bold text-white">{phase.title}</h4>
          </motion.div>
        ))}
      </div>

      {!reduceMotion && (
        <div className="mt-8 flex justify-center">
          <div className="relative w-full max-w-xs h-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400"
              style={{ width: progressWidth }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Left box: plain overflow-y-auto, the browser's own scroll physics.
 * Right box: wheel events are captured and replayed through an eased,
 * delayed scrollTop update instead of letting the browser handle them
 * directly — a small, honest simulation of what a scroll-hijacking
 * library actually does, so the difference is something you feel rather
 * than take our word for.
 */
function ScrollCompareDemo() {
  const hijackRef = useRef<HTMLDivElement>(null);
  const targetScroll = useRef(0);
  const currentScroll = useRef(0);
  const frame = useRef<number | undefined>(undefined);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = hijackRef.current;
    if (!el || reduceMotion) return;

    targetScroll.current = el.scrollTop;
    currentScroll.current = el.scrollTop;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const max = el.scrollHeight - el.clientHeight;
      targetScroll.current = Math.min(max, Math.max(0, targetScroll.current + e.deltaY));
    };

    const tick = () => {
      // Deliberately sluggish easing — 6% of the gap per frame — to make
      // the lag a hijacked scroll introduces obvious rather than subtle.
      currentScroll.current += (targetScroll.current - currentScroll.current) * 0.06;
      el.scrollTop = currentScroll.current;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [reduceMotion]);

  const filler = Array.from({ length: 8 });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <p className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-300/70 border-b border-white/10">
          native
        </p>
        <div className="h-48 overflow-y-auto p-5 space-y-3">
          {filler.map((_, i) => (
            <p key={i} className="text-sm text-white/45">
              Scroll me — this is the browser's own physics, untouched.
            </p>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <p className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-red-300/70 border-b border-white/10">
          simulated hijack
        </p>
        <div ref={hijackRef} className="h-48 overflow-y-auto p-5 space-y-3">
          {filler.map((_, i) => (
            <p key={i} className="text-sm text-white/45">
              {reduceMotion
                ? 'Disabled under reduced motion.'
                : 'Scroll me — every wheel tick gets intercepted and replayed on a lag.'}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Replayable version of the homepage's first-visit Intro splash — same
 * keyframed seam-line + bloom + wordmark timeline, minus the sessionStorage
 * gate, plus a button that remounts it (via a changing key) to play again.
 */
function IntroDemo() {
  const [playKey, setPlayKey] = useState(0);
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative rounded-2xl border border-white/10 overflow-hidden">
      <div className="relative h-64 md:h-80 bg-[#05030a] flex items-center justify-center overflow-hidden">
        {reduceMotion ? (
          <p className="font-bold text-white" style={{ fontSize: 'clamp(1.5rem, 6vw, 3rem)' }}>
            both<span className="text-white/50">made</span>
          </p>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={playKey} className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="absolute top-0 bottom-0 w-px bg-white"
                initial={{ scaleY: 0.1, boxShadow: '0 0 0 rgba(255,255,255,0)' }}
                animate={{
                  scaleY: [0.1, 0.5, 1, 2],
                  boxShadow: [
                    '0 0 0 rgba(255,255,255,0)',
                    '0 0 20px rgba(255,255,255,0.4)',
                    '0 0 60px rgba(255,255,255,0.6)',
                    '0 0 120px rgba(255,255,255,0.9)',
                  ],
                }}
                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], times: [0, 0.3, 0.6, 1] }}
                style={{ originY: 0.5 }}
              />
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.15 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                style={{ background: 'linear-gradient(90deg, rgba(56,189,248,0.7) 0%, transparent 50%)' }}
              />
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.12 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                style={{ background: 'linear-gradient(270deg, rgba(168,85,247,0.7) 0%, transparent 50%)' }}
              />
              <motion.p
                className="relative z-10 font-bold tracking-tight text-white"
                initial={{ opacity: 0, scale: 0.7, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ fontSize: 'clamp(1.5rem, 6vw, 3rem)' }}
              >
                both<span className="text-white/50">made</span>
              </motion.p>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <button
        onClick={() => setPlayKey((k) => k + 1)}
        className="w-full py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/50 hover:text-white border-t border-white/10 transition-colors"
      >
        {reduceMotion ? 'motion reduced — static' : '↻ replay'}
      </button>
    </div>
  );
}

/** Same technique as the site-wide ScrollSeamIndicator, scoped to a bounded box via useScroll({ container }). */
function SeamIndicatorDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });

  return (
    <div className="relative rounded-2xl border border-white/10 overflow-hidden">
      <motion.div
        className="absolute right-4 top-4 bottom-4 w-px bg-gradient-to-b from-white via-white to-transparent pointer-events-none z-10"
        style={{ scaleY: scrollYProgress, transformOrigin: 'top center' }}
      />
      <div ref={containerRef} className="h-56 overflow-y-auto p-6 pr-10 space-y-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
          scroll this box — watch the line on the right
        </p>
        {Array.from({ length: 6 }).map((_, i) => (
          <p key={i} className="text-sm text-white/45 leading-relaxed">
            Line {i + 1} — the seam line grows from nothing to full height exactly in step
            with how far through this box you've scrolled.
          </p>
        ))}
      </div>
    </div>
  );
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
