'use client';

import { useState } from 'react';
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import Link from 'next/link';
import { useRef } from 'react';

type World = {
  id: string;
  index: string;
  title: string;
  href: string;
  meta: string;
  blurb: string;
  titleStyle: React.CSSProperties;
  bg: React.ReactNode;
};

const WORLDS: World[] = [
  {
    id: 'web',
    index: '01',
    title: 'WEB',
    href: '/web',
    meta: 'React · Next.js · TypeScript',
    blurb: 'Marketing sites, SaaS platforms, dashboards — engineered to load fast and convert.',
    titleStyle: {
      color: 'transparent',
      WebkitTextStroke: '2px rgba(125,211,252,0.85)',
    },
    bg: (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,#04223d_0%,#02060d_65%)]" />
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(56,189,248,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.35) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
      </>
    ),
  },
  {
    id: 'ios',
    index: '02',
    title: 'iOS & iPAD',
    href: '/ios',
    meta: 'Swift · SwiftUI · Combine',
    blurb: 'Native apps built for the App Store — retention and revenue treated as design problems.',
    titleStyle: {
      color: 'transparent',
      backgroundImage: 'linear-gradient(180deg, #fff 25%, #a5b4fc)',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
    },
    bg: (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_35%,#191348_0%,#05030a_65%)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[clamp(180px,20vw,320px)] h-[68%] rounded-[3rem] border border-indigo-400/20 bg-indigo-500/[0.04] shadow-[0_0_120px_rgba(99,102,241,0.16)_inset]" />
        </div>
      </>
    ),
  },
  {
    id: 'mac',
    index: '03',
    title: 'macOS',
    href: '/ios',
    meta: 'AppKit · SwiftUI · Menu bar',
    blurb: 'Desktop software that respects the platform, from menu-bar utilities to full suites.',
    titleStyle: {
      color: 'transparent',
      backgroundImage: 'linear-gradient(180deg, #fff 25%, #c4b5fd)',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
    },
    bg: (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,#231045_0%,#060310_65%)]" />
        {/* menu bar */}
        <div className="absolute top-0 inset-x-0 h-8 border-b border-violet-300/15 bg-violet-400/[0.05] backdrop-blur-sm flex items-center gap-5 px-5 font-mono text-[10px] text-violet-200/40">
          <span></span><span>File</span><span>Edit</span><span>View</span><span>Window</span>
        </div>
        {/* window */}
        <div className="absolute left-[12%] right-[12%] top-[22%] bottom-[24%] rounded-xl border border-violet-300/15 bg-violet-400/[0.03]">
          <div className="h-8 border-b border-violet-300/10 flex items-center gap-1.5 px-4">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-300/25" />
            <span className="w-2.5 h-2.5 rounded-full bg-violet-300/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-violet-300/10" />
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'vision',
    index: '04',
    title: 'VISION PRO',
    href: '/visionpro',
    meta: 'visionOS · RealityKit · Spatial',
    blurb: 'Immersive spatial computing — the platform almost nobody has shipped on yet.',
    titleStyle: {
      color: 'transparent',
      backgroundImage: 'linear-gradient(100deg, #f0abfc 10%, #c084fc 50%, #818cf8)',
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
    },
    bg: (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,#2b1148_0%,#06030c_65%)]" />
        {[
          { x: '14%', y: '18%', w: 150, h: 100, r: '-6deg' },
          { x: '72%', y: '58%', w: 130, h: 170, r: '5deg' },
          { x: '68%', y: '14%', w: 110, h: 110, r: '-3deg' },
          { x: '16%', y: '62%', w: 180, h: 100, r: '4deg' },
        ].map((s, i) => (
          <div
            key={i}
            className="absolute rounded-2xl border border-white/15"
            style={{
              left: s.x,
              top: s.y,
              width: s.w,
              height: s.h,
              transform: `rotate(${s.r})`,
              background: 'linear-gradient(140deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02))',
              backdropFilter: 'blur(10px)',
            }}
          />
        ))}
      </>
    ),
  },
];

/**
 * "What we make" as four full-screen worlds. The section pins and the
 * scrollbar drags the seam: each discipline wipes across the viewport behind
 * a travelling line of light — the hero's drag mechanic, replayed by scroll.
 */
export function ServiceList() {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 150, damping: 30, mass: 0.4 });

  useMotionValueEvent(progress, 'change', (v) => {
    // Which world owns the screen right now (wipe midpoints at 1/4, 2/4, 3/4).
    const idx = Math.min(WORLDS.length - 1, Math.max(0, Math.round(v * (WORLDS.length - 1))));
    if (idx !== active) setActive(idx);
  });

  if (reduceMotion) return <StaticWorlds />;

  return (
    <section id="services" ref={containerRef} className="relative h-[500vh]">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* header, floating above every world */}
        <div className="absolute top-24 inset-x-0 z-40 px-6">
          <div className="max-w-6xl mx-auto flex items-baseline justify-between">
            <h2 className="text-sm font-mono uppercase tracking-[0.4em] text-white/50">
              What we make
            </h2>
            <span className="font-mono text-sm text-white/35 tabular-nums">
              {WORLDS[active].index} / 04
            </span>
          </div>
        </div>

        {/* the worlds — each presents over the last like an iOS sheet */}
        {WORLDS.map((world, i) => (
          <WorldSheet
            key={world.id}
            world={world}
            index={i}
            progress={progress}
            interactive={active === i}
          />
        ))}

        {/* page dots, straight out of the iOS pattern language — and, like
            the real ones, tappable: each jumps the scroll to its world. */}
        <div className="absolute bottom-7 inset-x-0 z-40 flex justify-center gap-1">
          {WORLDS.map((w, i) => (
            <button
              key={w.id}
              aria-label={`Go to ${w.title}`}
              aria-current={active === i}
              onClick={() => {
                const el = containerRef.current;
                if (!el) return;
                const top = el.getBoundingClientRect().top + window.scrollY;
                const scrollable = el.offsetHeight - window.innerHeight;
                window.scrollTo({
                  top: top + (scrollable * i) / (WORLDS.length - 1),
                  behavior: 'smooth',
                });
              }}
              className="group p-2"
            >
              <span
                className="block h-1.5 rounded-full transition-all duration-500 group-hover:bg-white/60"
                style={{
                  width: active === i ? 22 : 6,
                  background: active === i ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)',
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * One world, presented the way iOS presents a sheet: it rises from the
 * bottom with rounded corners and a grab handle, docks full-screen as the
 * corners square off — and when the next sheet arrives, this one sinks into
 * depth: scaled down, dimmed, pushed slightly up. The section reads as a
 * stack of physical panes, not a slideshow.
 */
function WorldSheet({
  world,
  index,
  progress,
  interactive,
}: {
  world: World;
  index: number;
  progress: MotionValue<number>;
  interactive: boolean;
}) {
  const n = WORLDS.length; // 4 sheets → 3 presentations across [0,1]
  const inStart = (index - 1) / (n - 1) + 0.05;
  const inEnd = index / (n - 1) - 0.03;
  // The window where the NEXT sheet buries this one.
  const outStart = index / (n - 1) + 0.05;
  const outEnd = (index + 1) / (n - 1) - 0.03;

  const isFirst = index === 0;
  const isLast = index === n - 1;

  // Rise: offscreen bottom → docked.
  const y = useTransform(
    progress,
    isFirst ? [0, 0.0001] : [inStart, Math.max(inEnd, inStart + 0.01)],
    isFirst ? ['0%', '0%'] : ['104%', '0%']
  );
  // Sheet corners: rounded while travelling, square once docked, rounded
  // again as the sheet recedes into the stack.
  const radius = useTransform(
    progress,
    isFirst
      ? [0, 0.0001, outStart, outEnd]
      : isLast
        ? [inStart, inEnd]
        : [inStart, inEnd, outStart, outEnd],
    isFirst ? [0, 0, 0, 28] : isLast ? [36, 0] : [36, 0, 0, 28]
  );
  // Being buried by the next sheet: recede into depth.
  const buriedScale = useTransform(
    progress,
    isLast ? [0, 1] : [outStart, outEnd],
    isLast ? [1, 1] : [1, 0.92]
  );
  const buriedY = useTransform(
    progress,
    isLast ? [0, 1] : [outStart, outEnd],
    isLast ? ['0%', '0%'] : ['0%', '-3%']
  );
  const dim = useTransform(
    progress,
    isLast ? [0, 1] : [outStart, outEnd],
    isLast ? [0, 0] : [0, 0.55]
  );
  // Grab handle: visible on approach, gone shortly after docking.
  const handleOpacity = useTransform(
    progress,
    isFirst ? [0, 0.0001] : [inStart, inEnd, Math.min(inEnd + 0.05, 1)],
    isFirst ? [0, 0] : [0.9, 0.9, 0]
  );
  // Content settles a beat after the sheet itself.
  const contentY = useTransform(
    progress,
    isFirst ? [0, 0.0001] : [inStart, Math.max(inEnd, inStart + 0.01)],
    isFirst ? ['0%', '0%'] : ['9%', '0%']
  );

  // Alternate composition per sheet so the acts don't rhyme visually.
  const align =
    index % 2 === 0 ? 'items-start text-left' : 'items-end text-right';

  return (
    <motion.div
      className="absolute inset-0 will-change-transform"
      style={{ scale: buriedScale, y: buriedY, zIndex: 10 + index }}
    >
      <motion.div
        className="absolute inset-0 overflow-hidden shadow-[0_-30px_80px_rgba(0,0,0,0.55)]"
        style={{
          y,
          borderRadius: radius,
          pointerEvents: interactive ? 'auto' : 'none',
        }}
        aria-hidden={!interactive}
      >
        {world.bg}

        {/* iOS sheet grab handle */}
        {!isFirst && (
          <motion.div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-12 h-1.5 rounded-full bg-white/30"
            style={{ opacity: handleOpacity }}
          />
        )}

        {/* content */}
        <motion.div
          className={`absolute inset-0 flex flex-col justify-center px-6 md:px-14 ${align}`}
          style={{ y: contentY }}
        >
          <div className="max-w-6xl w-full mx-auto flex flex-col gap-0" style={{ alignItems: 'inherit' }}>
            <p className="mb-4 font-mono text-xs text-white/35 tabular-nums">{world.index}</p>

            <h3
              className="font-bold leading-[0.9] tracking-[-0.04em] whitespace-nowrap select-none"
              style={{ fontSize: 'clamp(3rem, 12vw, 11rem)', ...world.titleStyle }}
            >
              {world.title}
            </h3>

            <div className={`mt-8 flex flex-col gap-4 ${index % 2 === 0 ? '' : 'items-end'}`}>
              <p className="font-mono text-xs text-white/40">{world.meta}</p>
              <p className="max-w-md text-sm md:text-base text-white/55 leading-relaxed">
                {world.blurb}
              </p>
              <Link
                href={world.href}
                tabIndex={interactive ? 0 : -1}
                className="group inline-flex items-center gap-3 text-sm font-medium text-white/80 hover:text-white transition-colors w-fit"
              >
                <span className="border-b border-white/30 group-hover:border-white pb-0.5 transition-colors">
                  Enter {world.title.toLowerCase()}
                </span>
                <span className="transition-transform duration-300 group-hover:translate-x-1.5">→</span>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* depth dimmer — darkens as the next sheet buries this one */}
        <motion.div
          className="absolute inset-0 z-40 bg-black pointer-events-none"
          style={{ opacity: dim }}
        />
      </motion.div>
    </motion.div>
  );
}

/** Reduced motion: the four worlds as plain stacked sections, no pinning. */
function StaticWorlds() {
  return (
    <section id="services" className="relative border-t border-white/10">
      {WORLDS.map((world) => (
        <div key={world.id} className="relative min-h-[70vh] overflow-hidden flex items-center px-6">
          {world.bg}
          <div className="relative max-w-6xl mx-auto w-full py-24">
            <p className="mb-4 font-mono text-xs text-white/35">{world.index}</p>
            <h3
              className="font-bold leading-[0.9] tracking-[-0.04em]"
              style={{ fontSize: 'clamp(2.5rem, 9vw, 8rem)', ...world.titleStyle }}
            >
              {world.title}
            </h3>
            <p className="mt-6 max-w-md text-white/55">{world.blurb}</p>
            <Link href={world.href} className="mt-6 inline-block text-white/80 underline underline-offset-4">
              Enter {world.title.toLowerCase()} →
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}
