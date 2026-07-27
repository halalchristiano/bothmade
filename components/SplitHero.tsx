'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useMotionValueEvent,
} from 'framer-motion';

const WORD = 'BOTHMADE';
const MIN = 6;
const MAX = 94;

/**
 * The seam, v2. Two complete worlds — web and native — pixel-aligned and
 * clipped by a draggable divider, so the wordmark morphs letter by letter as
 * the seam sweeps. New in this pass: the seam rides a spring (it glides with
 * weight instead of snapping), double-click slams it to either world, and
 * each side's copy brightens as its world takes over. Scrolling stays fully
 * native — only the handle itself captures touch.
 */
export function SplitHero() {
  const containerRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  // Mirrored into React state so aria-valuenow actually updates — motion
  // values bypass render, and a slider that always announces "50" is worse
  // than no slider at all.
  const [ariaNow, setAriaNow] = useState(50);

  // Target position; the spring chases it. Dragging tightens the spring so
  // the seam feels attached to the pointer, releasing lets it settle softly.
  const target = useMotionValue(50);
  const seam = useSpring(target, { stiffness: 340, damping: 34, mass: 0.6 });

  const clipPath = useMotionTemplate`inset(0 ${useTransform(seam, (v) => 100 - v)}% 0 0)`;
  const seamLeft = useMotionTemplate`${seam}%`;

  // Copy emphasis follows whoever is winning.
  const webCopyOpacity = useTransform(seam, [MIN, 50, MAX], [0.25, 0.75, 1]);
  const nativeCopyOpacity = useTransform(seam, [MIN, 50, MAX], [1, 0.75, 0.25]);

  useMotionValueEvent(seam, 'change', (v) => {
    const rounded = Math.round(v);
    if (rounded !== ariaNow) setAriaNow(rounded);
  });

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    target.set(Math.min(MAX, Math.max(MIN, pct)));
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

  const hoverSteer = (e: React.PointerEvent) => {
    if (dragging || e.pointerType !== 'mouse') return;
    setHasInteracted(true);
    setFromClientX(e.clientX);
  };

  const snap = () => {
    setHasInteracted(true);
    const v = seam.get();
    // Slam toward whichever side the seam is already leaning.
    target.set(v >= 50 ? MAX : MIN);
  };

  const nudge = (delta: number) => {
    setHasInteracted(true);
    target.set(Math.min(MAX, Math.max(MIN, target.get() + delta)));
  };

  return (
    <section
      ref={containerRef}
      onPointerMove={hoverSteer}
      className="relative h-[100svh] w-full overflow-hidden select-none"
    >
      <h1 className="sr-only">
        Bothmade — web and native Apple development studio. Websites, iOS and iPad apps,
        macOS software, and Vision Pro experiences built by one team.
      </h1>

      {/* ---------- LAYER A : NATIVE (base, right side) ---------- */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,#1a0b2e_0%,#05030a_60%)]" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[clamp(220px,26vw,420px)] h-[70%] rounded-[3rem] border border-purple-400/15 bg-purple-500/[0.03] shadow-[0_0_120px_rgba(147,51,234,0.15)_inset]" />
        </div>

        <SideLabel side="right" text="native" tone="purple" />
        <Wordmark variant="native" />
        <Copy
          side="right"
          kicker="for the device"
          sub="Swift, SwiftUI, RealityKit. Apps that feel like they shipped from Cupertino."
          tone="purple"
          emphasis={nativeCopyOpacity}
        />
      </div>

      {/* ---------- LAYER B : WEB (clipped from the seam leftward) ---------- */}
      <motion.div className="absolute inset-0" style={{ clipPath }}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,#04223d_0%,#02060d_60%)]" />

        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(56,189,248,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.35) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="absolute top-24 left-10 right-10 h-9 rounded-t-xl border border-sky-400/20 bg-sky-400/[0.04] flex items-center gap-2 px-4">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400/30" />
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400/20" />
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400/10" />
          <span className="ml-3 text-[10px] font-mono text-sky-300/40 tracking-widest">
            bothmade.studio
          </span>
        </div>

        <SideLabel side="left" text="&lt;web&gt;" tone="sky" />
        <Wordmark variant="web" />
        <Copy
          side="left"
          kicker="for the browser"
          sub="React, Next.js, TypeScript. Interfaces engineered to load fast and convert."
          tone="sky"
          emphasis={webCopyOpacity}
        />
      </motion.div>

      {/* ---------- THE SEAM ---------- */}
      <motion.div
        className="absolute top-0 bottom-0 z-30 w-px bg-gradient-to-b from-transparent via-white to-transparent"
        style={{ left: seamLeft }}
      >
        <div className="absolute inset-0 -left-6 -right-6 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.14),transparent_70%)] pointer-events-none" />

        <button
          onPointerDown={(e) => {
            // preventDefault stops text selection during the drag, but also
            // suppresses default focus — restore it for the arrow keys.
            e.preventDefault();
            e.currentTarget.focus();
            setDragging(true);
            setHasInteracted(true);
          }}
          onDoubleClick={snap}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 12 : 4;
            if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step); }
            else if (e.key === 'Home') { e.preventDefault(); setHasInteracted(true); target.set(MIN); }
            else if (e.key === 'End') { e.preventDefault(); setHasInteracted(true); target.set(MAX); }
          }}
          role="slider"
          aria-label="Reveal the web or native side"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={ariaNow}
          aria-valuetext={`${ariaNow}% web, ${100 - ariaNow}% native`}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border border-white/25 bg-black/60 backdrop-blur-md grid place-items-center cursor-ew-resize touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <span className="text-white/70 text-xs tracking-[0.2em] font-mono">↔</span>
          <motion.span
            className="absolute inset-0 rounded-full border border-white/20"
            animate={hasInteracted ? { scale: 1, opacity: 0 } : { scale: [1, 1.5], opacity: [0.5, 0] }}
            transition={{ duration: 1.8, repeat: hasInteracted ? 0 : Infinity, ease: 'easeOut' }}
          />
        </button>
      </motion.div>

      {/* scroll cue */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 text-[10px] font-mono tracking-[0.35em] text-white/30"
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        SCROLL
      </motion.div>
    </section>
  );
}

/* Identical geometry in both layers — only the treatment changes.
   That pixel alignment is what makes the seam read as a morph, not a cut. */
function Wordmark({ variant }: { variant: 'web' | 'native' }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6" aria-hidden="true">
      <p
        className="font-bold leading-none tracking-[-0.03em] whitespace-nowrap"
        style={{ fontSize: 'clamp(2.75rem, 12vw, 11rem)' }}
      >
        {variant === 'web' ? (
          <span
            className="text-transparent"
            style={{ WebkitTextStroke: '1.5px rgba(125, 211, 252, 0.85)' }}
          >
            {WORD}
          </span>
        ) : (
          <span className="bg-gradient-to-b from-white via-white to-purple-300 bg-clip-text text-transparent">
            {WORD}
          </span>
        )}
      </p>
    </div>
  );
}

/* Each world keeps its copy in its own corner; brightness follows the seam. */
function Copy({
  side,
  kicker,
  sub,
  tone,
  emphasis,
}: {
  side: 'left' | 'right';
  kicker: string;
  sub: string;
  tone: 'sky' | 'purple';
  emphasis: import('framer-motion').MotionValue<number>;
}) {
  const isSky = tone === 'sky';

  return (
    <motion.div
      style={{ opacity: emphasis }}
      className={`absolute bottom-28 hidden md:block max-w-xs ${
        side === 'left' ? 'left-16 text-left' : 'right-16 text-right'
      }`}
    >
      <p
        className={`mb-3 text-[10px] font-mono uppercase tracking-[0.35em] ${
          isSky ? 'text-sky-300/70' : 'text-purple-300/70'
        }`}
      >
        {kicker}
      </p>
      <p
        className={`text-xs md:text-sm leading-relaxed ${
          isSky ? 'text-sky-100/50 font-mono' : 'text-purple-50/55'
        }`}
      >
        {sub}
      </p>
    </motion.div>
  );
}

function SideLabel({
  side,
  text,
  tone,
}: {
  side: 'left' | 'right';
  text: string;
  tone: 'sky' | 'purple';
}) {
  return (
    <span
      className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-mono uppercase tracking-[0.5em] ${
        side === 'left' ? 'left-6 md:left-10' : 'right-6 md:right-10'
      } ${tone === 'sky' ? 'text-sky-300/40' : 'text-purple-300/40'}`}
      style={{
        writingMode: 'vertical-rl',
        transform: `translateY(-50%) rotate(${side === 'left' ? '180deg' : '0deg'})`,
      }}
    >
      {text}
    </span>
  );
}
