'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { PillCTA } from '@/components/ui';

/**
 * The visionOS page is built out of depth. Everything sits on its own
 * z-plane inside a real CSS perspective, and moving the pointer rotates the
 * whole scene — the parallax you get from moving your head in a headset.
 * Flat screenshots cannot convey this, which is exactly the point.
 */
export function VisionHero() {
  const ref = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [9, -9]), {
    stiffness: 90,
    damping: 20,
  });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-14, 14]), {
    stiffness: 90,
    damping: 20,
  });

  useEffect(() => setReady(true), []);

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

  return (
    <section
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className="relative min-h-[100svh] overflow-hidden bg-[#05030a]"
      style={{ perspective: '1400px' }}
    >
      {/* simulated passthrough */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,#2b1148_0%,#06030c_65%)]" />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(circle at 15% 75%, rgba(168,85,247,0.20), transparent 45%), radial-gradient(circle at 85% 20%, rgba(56,189,248,0.14), transparent 45%)',
        }}
      />

      <motion.div
        className="relative h-[100svh] grid place-items-center px-6"
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
      >
        {/* far plane — depth grid */}
        <motion.div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[60vh] opacity-[0.16]"
          style={{
            transform: 'translateZ(-420px)',
            backgroundImage:
              'linear-gradient(rgba(192,132,252,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(192,132,252,0.5) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        {/* drifting glass shards, mid-depth */}
        {[
          { z: -260, x: '-30vw', y: '-24vh', w: 190, h: 130, d: 0 },
          { z: -180, x: '30vw', y: '18vh', w: 160, h: 210, d: 1.2 },
          { z: -320, x: '24vw', y: '-28vh', w: 130, h: 130, d: 2.1 },
          { z: -140, x: '-34vw', y: '24vh', w: 210, h: 120, d: 0.6 },
        ].map((s, i) => (
          // Static depth transform on the wrapper; framer's bobbing animation
          // on the child — combining them on one element lets animate clobber
          // the translate3d and stack every shard dead centre.
          <div
            key={i}
            className="absolute"
            style={{ transform: `translate3d(${s.x}, ${s.y}, ${s.z}px)` }}
          >
            <motion.div
              className="rounded-3xl border border-white/15"
              style={{
                width: s.w,
                height: s.h,
                background:
                  'linear-gradient(140deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))',
                backdropFilter: 'blur(14px)',
                boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
              }}
              animate={{ y: [0, -14, 0] }}
              transition={{
                duration: 7 + s.d,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: s.d,
              }}
            />
          </div>
        ))}

        {/* near plane — the actual content, on glass */}
        <motion.div
          className="relative max-w-3xl rounded-[2rem] border border-white/20 px-8 py-12 md:px-14 md:py-16"
          style={{
            transform: 'translateZ(70px)',
            background:
              'linear-gradient(150deg, rgba(255,255,255,0.13), rgba(255,255,255,0.04))',
            backdropFilter: 'blur(28px)',
            boxShadow:
              '0 40px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={ready ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.45em] text-purple-200/80">
            vision pro · visionos
          </p>

          <h1
            className="font-bold leading-[0.95] tracking-[-0.03em]"
            style={{ fontSize: 'clamp(2.25rem, 6.5vw, 5rem)' }}
          >
            The interface
            <br />
            leaves the
            <br />
            <span className="bg-gradient-to-r from-purple-200 via-purple-300 to-sky-300 bg-clip-text text-transparent">
              rectangle.
            </span>
          </h1>

          <p className="mt-8 max-w-md text-base leading-relaxed text-white/60">
            Move your pointer. Everything here sits at a different depth, because on
            this platform depth is the layout — not decoration.
          </p>

          <div className="mt-10">
            <PillCTA href="/start?service=visionos">Build your Vision Pro app</PillCTA>
          </div>
        </motion.div>

        {/* closest plane — floating chip. The static depth transform lives on
            the wrapper because framer's animate would overwrite it. */}
        <div
          className="absolute"
          style={{
            transform: 'translate3d(clamp(-340px, -34vw, -180px), -260px, 170px)',
          }}
        >
          <motion.div
            className="rounded-full border border-white/25 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/70"
            style={{
              background: 'rgba(255,255,255,0.10)',
              backdropFilter: 'blur(18px)',
            }}
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            spatial · not flat
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
