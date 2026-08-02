'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PillCTA } from '@/components/ui';

type Rect = { top: number; left: number; width: number; height: number };

const APPS = [
  { label: 'Ridgeline', glyph: '⛰', from: '#4f46e5', to: '#1e1b4b' },
  { label: 'Cadence', glyph: '◷', from: '#0ea5e9', to: '#0c2f52' },
  { label: 'Ledger', glyph: '◧', from: '#059669', to: '#052e26' },
  { label: 'Signal', glyph: '◉', from: '#e11d48', to: '#4c0519' },
  { label: 'Atlas', glyph: '◈', from: '#f59e0b', to: '#451a03' },
  { label: 'Prism', glyph: '◐', from: '#8b5cf6', to: '#2e1065' },
  { label: 'Volta', glyph: '⌁', from: '#06b6d4', to: '#083344' },
  { label: 'Quarry', glyph: '⬢', from: '#64748b', to: '#0f172a' },
];

/**
 * The iOS page opens on a Springboard. Tapping an icon runs the real
 * app-launch transition — the icon expands from its own position into the
 * page. It is the single most recognisable animation on the platform, so it
 * belongs here and nowhere else on the site.
 */
function Clock() {
  // Rendered only after mount — the server can't know the visitor's local
  // time, and guessing it would throw a hydration mismatch.
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () =>
      setTime(
        new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      );
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, []);

  return <span className="tabular-nums font-semibold">{time}</span>;
}

export function IOSHero() {
  const [launching, setLaunching] = useState<Rect | null>(null);
  const [open, setOpen] = useState(false);
  const [hinted, setHinted] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setHinted(true), 1600);
    return () => clearTimeout(t);
  }, []);

  const launch = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget.getBoundingClientRect();
    const host = sectionRef.current?.getBoundingClientRect();
    if (!host) return;

    setLaunching({
      top: el.top - host.top,
      left: el.left - host.left,
      width: el.width,
      height: el.height,
    });
    setOpen(true);
  };

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[100svh] overflow-hidden bg-[#05030a]"
    >
      {/* wallpaper */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,#221a4d_0%,#07050f_60%)]" />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          background:
            'radial-gradient(circle at 20% 80%, rgba(99,102,241,0.18), transparent 45%), radial-gradient(circle at 80% 30%, rgba(168,85,247,0.14), transparent 45%)',
        }}
      />

      {/* status bar */}
      <motion.div
        className="absolute top-20 inset-x-0 z-10 flex items-center justify-center gap-6 font-mono text-[11px] text-white/70"
        animate={{ opacity: open ? 0 : 1 }}
      >
        <Clock />
        <span className="tracking-widest">●●●●</span>
        <span>⚡ 100%</span>
      </motion.div>

      {/* ---------------- Springboard ---------------- */}
      <div className="relative h-[100svh] flex flex-col items-center justify-center px-6 pt-24 pb-16">
        <motion.p
          className="mb-10 font-mono text-[10px] uppercase tracking-[0.45em] text-white/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: open ? 0 : 1 }}
          transition={{ duration: 0.4 }}
        >
          ios · ipados · macos
        </motion.p>

        <motion.div
          className="grid grid-cols-4 gap-5 sm:gap-7"
          animate={
            open
              ? { scale: 1.08, opacity: 0, filter: 'blur(6px)' }
              : { scale: 1, opacity: 1, filter: 'blur(0px)' }
          }
          transition={{ duration: 0.5, ease: [0.32, 0, 0.2, 1] }}
        >
          {APPS.map((app, i) => (
            <motion.div
              key={app.label}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.1 + i * 0.05,
                type: 'spring',
                stiffness: 260,
                damping: 18,
              }}
              className="flex flex-col items-center gap-2"
            >
              <button
                onClick={launch}
                aria-label={`Open ${app.label}`}
                className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-[22%] grid place-items-center text-2xl sm:text-3xl text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-200 active:scale-90 hover:scale-105"
                style={{ background: `linear-gradient(150deg, ${app.from}, ${app.to})` }}
              >
                <span
                  className="absolute inset-0 rounded-[22%] opacity-60"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 45%)',
                  }}
                />
                <span className="relative">{app.glyph}</span>

                {i === 0 && hinted && !open && (
                  <motion.span
                    className="absolute inset-0 rounded-[22%] border-2 border-white/70"
                    animate={{ scale: [1, 1.28], opacity: [0.8, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
              </button>
              <span className="text-[10px] sm:text-xs text-white/55">{app.label}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          className="mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-white/30"
          animate={{ opacity: open ? 0 : 1 }}
        >
          tap an app to open
        </motion.p>

        {/* dock */}
        <motion.div
          className="mt-8 flex gap-5 rounded-[2rem] border border-white/10 bg-white/[0.07] px-6 py-4 backdrop-blur-2xl"
          initial={{ opacity: 0, y: 30 }}
          animate={open ? { opacity: 0 } : { opacity: 1, y: 0 }}
          transition={{ delay: 0.55, type: 'spring', stiffness: 200, damping: 20 }}
        >
          {[
            { glyph: '✆', from: '#22c55e', to: '#14532d' },
            { glyph: '✉', from: '#3b82f6', to: '#1e3a8a' },
            { glyph: '♫', from: '#ec4899', to: '#831843' },
            { glyph: '⌘', from: '#8b5cf6', to: '#2e1065' },
          ].map((d, i) => (
            <button
              key={i}
              onClick={launch}
              aria-label="Open app"
              className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-[24%] grid place-items-center text-xl text-white/90 shadow-lg transition-transform duration-200 hover:scale-110 active:scale-90"
              style={{ background: `linear-gradient(150deg, ${d.from}, ${d.to})` }}
            >
              <span
                className="absolute inset-0 rounded-[24%] opacity-60"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 45%)',
                }}
              />
              <span className="relative">{d.glyph}</span>
            </button>
          ))}
        </motion.div>
      </div>

      {/* ---------------- Launched app ---------------- */}
      <AnimatePresence>
        {open && launching && (
          <motion.div
            className="absolute z-20 overflow-hidden bg-[#07050f]"
            initial={{
              top: launching.top,
              left: launching.left,
              width: launching.width,
              height: launching.height,
              borderRadius: '22%',
            }}
            animate={{
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              borderRadius: 0,
            }}
            transition={{ duration: 0.62, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_25%,#1e1b4b_0%,#07050f_65%)]" />

            <motion.div
              className="relative h-full flex flex-col justify-center px-6 md:px-16"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, duration: 0.5 }}
            >
              <div className="max-w-5xl mx-auto w-full">
                <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.45em] text-indigo-300/70">
                  ios · ipados · macos
                </p>

                <h1
                  className="font-bold leading-[0.95] tracking-[-0.03em]"
                  style={{ fontSize: 'clamp(2.5rem, 8vw, 6.5rem)' }}
                >
                  Apps people
                  <br />
                  keep on their
                  <br />
                  <span className="bg-gradient-to-r from-indigo-200 via-indigo-300 to-indigo-500 bg-clip-text text-transparent">
                    home screen.
                  </span>
                </h1>

                <p className="mt-8 max-w-xl text-base md:text-lg leading-relaxed text-white/50">
                  That transition you just watched is the one users see every time they
                  open an app. Getting the small things exactly right is most of the job.
                </p>

                <div className="mt-10 flex flex-wrap gap-4">
                  <PillCTA href="/start?service=ios-app">Start your iOS project</PillCTA>
                  <PillCTA
                    muted
                    onClick={() => {
                      setOpen(false);
                      setLaunching(null);
                    }}
                  >
                    ← Back to home screen
                  </PillCTA>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
