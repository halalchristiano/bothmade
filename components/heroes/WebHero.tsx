'use client';

import { useEffect, useRef } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import { PillCTA } from '@/components/ui';

/**
 * Scroll-choreographed opening, Apple-keynote style. The section pins for
 * 400vh and the scrollbar becomes the timeline: each word scales up until you
 * fly straight through it into the next. Letters also carry a live
 * variable-weight field under the pointer, so the type is alive even while
 * the scroll is parked.
 */

const ACTS = [
  { word: 'FAST.', copy: 'Sub-second loads. 60fps everywhere. Speed is the first design decision.' },
  { word: 'FLUID.', copy: 'Interfaces that respond like native apps — because the web can, when it’s built properly.' },
  { word: 'CONVERTS.', copy: 'Beautiful is table stakes. We design for the moment a visitor becomes a customer.' },
];

export function WebHero() {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.3 });

  if (reduceMotion) return <StaticHero />;

  return (
    <div ref={containerRef} className="relative h-[400vh] bg-[#02060d]">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* structural grid, receding slightly as you travel */}
        <motion.div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(56,189,248,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.4) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            scale: useTransform(progress, [0, 1], [1, 1.35]),
          }}
        />

        {/* kicker */}
        <motion.p
          className="absolute top-28 left-6 md:left-12 z-20 font-mono text-[10px] uppercase tracking-[0.45em] text-sky-300/60"
          style={{ opacity: useTransform(progress, [0, 0.06, 0.92, 1], [1, 1, 1, 0]) }}
        >
          web development
        </motion.p>

        {/* the three acts */}
        {ACTS.map((act, i) => (
          <Act key={act.word} index={i} progress={progress} word={act.word} copy={act.copy} />
        ))}

        {/* CTA lands with the final word */}
        <motion.div
          className="absolute inset-x-0 bottom-14 z-20 flex justify-center"
          style={{
            opacity: useTransform(progress, [0.78, 0.88], [0, 1]),
            y: useTransform(progress, [0.78, 0.88], [24, 0]),
          }}
        >
          <PillCTA href="/#contact" size="lg">
            Start your web project
          </PillCTA>
        </motion.div>

        {/* scroll cue, first act only */}
        <motion.div
          className="absolute bottom-8 inset-x-0 z-20 flex justify-center"
          style={{ opacity: useTransform(progress, [0, 0.08], [1, 0]) }}
        >
          <motion.span
            className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/35"
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            scroll
          </motion.span>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * One word of the sequence. Enters small, settles, then scales up ~9× while
 * fading — the camera flies through it into the next act.
 */
function Act({
  index,
  progress,
  word,
  copy,
}: {
  index: number;
  progress: MotionValue<number>;
  word: string;
  copy: string;
}) {
  // Each act owns a slice of the timeline. The last one settles and stays.
  const SLOTS: [number, number, number, number][] = [
    [0.0, 0.0, 0.24, 0.36],
    [0.28, 0.4, 0.54, 0.66],
    [0.58, 0.72, 1.0, 1.0],
  ];
  const [enterStart, settled, exitStart, exitEnd] = SLOTS[index];
  const last = index === ACTS.length - 1;

  const scale = useTransform(
    progress,
    [enterStart, settled, exitStart, exitEnd],
    index === 0 ? [1, 1, 1, 9] : last ? [0.55, 1, 1, 1] : [0.55, 1, 1, 9]
  );
  const opacity = useTransform(
    progress,
    [enterStart, Math.min(settled, enterStart + 0.06), exitStart, Math.min(exitEnd, exitStart + 0.07)],
    index === 0 ? [1, 1, 1, 0] : last ? [0, 1, 1, 1] : [0, 1, 1, 0]
  );
  const copyOpacity = useTransform(
    progress,
    index === 0
      ? [0, 0.001, exitStart, exitStart + 0.05] // visible from the first frame
      : [enterStart + 0.02, settled + 0.04, exitStart, exitStart + 0.05],
    last ? [0, 1, 1, 1] : index === 0 ? [1, 1, 1, 0] : [0, 1, 1, 0]
  );

  return (
    <div className="absolute inset-0 grid place-items-center pointer-events-none">
      <motion.div style={{ scale, opacity }} className="will-change-transform">
        <KineticWord text={word} />
      </motion.div>

      <motion.p
        className="absolute bottom-32 md:bottom-36 left-6 right-6 md:left-12 md:right-auto md:max-w-md text-sm md:text-base leading-relaxed text-white/50"
        style={{ opacity: copyOpacity }}
      >
        {copy}
      </motion.p>
    </div>
  );
}

/** Giant word whose letters carry the pointer-proximity weight field. */
function KineticWord({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
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
  }, []);

  return (
    <span
      ref={ref}
      aria-label={text}
      className="block select-none font-bold leading-none tracking-[-0.04em] whitespace-nowrap"
      style={{ fontSize: 'clamp(3.5rem, 16vw, 15rem)' }}
    >
      {text.split('').map((ch, i) => (
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
  );
}

/** Reduced-motion fallback: everything, plainly, no pinning or flight. */
function StaticHero() {
  return (
    <section className="relative min-h-screen bg-[#02060d] flex flex-col justify-center px-6 md:px-12 py-32">
      <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.45em] text-sky-300/60">
        web development
      </p>
      {ACTS.map((act) => (
        <h2
          key={act.word}
          className="font-bold leading-[0.95] tracking-[-0.04em] text-sky-100"
          style={{ fontSize: 'clamp(3rem, 11vw, 9rem)' }}
        >
          {act.word}
        </h2>
      ))}
      <p className="mt-10 max-w-md text-base leading-relaxed text-white/50">
        Marketing sites, SaaS platforms, dashboards — built on React and Next.js.
      </p>
      <div className="mt-10">
        <PillCTA href="/#contact" size="lg">
          Start your web project
        </PillCTA>
      </div>
    </section>
  );
}
