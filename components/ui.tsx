'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import type { ReactNode, ComponentProps } from 'react';

/*
 * The three primitives every page was previously copy-pasting. One source of
 * truth: change the house style here and the whole site follows.
 */

/**
 * Magnetic offset — while the pointer is within `reach` of the element's
 * center, the element drifts a fraction of the way toward it; a spring
 * pulls it back to rest the instant the pointer leaves. Fine-pointer only
 * and inert under reduced motion, so it never fights touch or a11y.
 */
function useMagnetic(reach = 70, pull = 0.35) {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const x = useSpring(0, { stiffness: 300, damping: 20, mass: 0.5 });
  const y = useSpring(0, { stiffness: 300, damping: 20, mass: 0.5 });

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < reach) {
        x.set(dx * pull);
        y.set(dy * pull);
      } else {
        x.set(0);
        y.set(0);
      }
    };
    const onLeave = () => {
      x.set(0);
      y.set(0);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    el.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [reach, pull, reduceMotion, x, y]);

  return { ref, x, y };
}

/** Pill CTA with the bottom-fill hover. Renders a Link, or a button when `type` is set. */
export function PillCTA({
  href,
  type,
  disabled,
  busy,
  size = 'md',
  muted = false,
  tone = 'dark',
  children,
  onClick,
}: {
  href?: string;
  type?: 'submit' | 'button';
  disabled?: boolean;
  busy?: boolean;
  size?: 'md' | 'lg';
  /** Quiet variant — no fill animation, dimmed border. */
  muted?: boolean;
  /** Surface the button sits on; light inverts the fill direction. */
  tone?: 'dark' | 'light';
  children: ReactNode;
  onClick?: () => void;
}) {
  const pad = size === 'lg' ? 'px-10 py-4 text-sm' : 'px-8 py-3.5 text-sm';
  const onLight = tone === 'light';
  const { ref, x, y } = useMagnetic();

  const className = muted
    ? onLight
      ? `rounded-full border border-black/15 ${pad} font-medium text-black/60 transition-colors duration-300 hover:border-black/40 hover:text-black`
      : `rounded-full border border-white/15 ${pad} font-medium text-white/60 transition-colors duration-300 hover:border-white/40 hover:text-white`
    : `group relative inline-block overflow-hidden rounded-full border ${
        onLight ? 'border-black/25 hover:border-black text-black' : 'border-white/25 hover:border-white'
      } ${pad} font-medium transition-colors duration-500 disabled:opacity-40 disabled:cursor-not-allowed`;

  const inner = muted ? (
    children
  ) : (
    <>
      <span
        className={`relative z-10 transition-colors duration-500 ${
          onLight ? 'group-hover:text-white' : 'group-hover:text-black'
        }`}
      >
        {children}
      </span>
      <span
        className={`absolute inset-0 translate-y-full transition-transform duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] group-hover:translate-y-0 ${
          onLight ? 'bg-black' : 'bg-white'
        }`}
      />
    </>
  );

  if (href) {
    return (
      <motion.div
        ref={ref as React.RefObject<HTMLDivElement>}
        style={{ x, y, display: 'inline-block' }}
      >
        <Link href={href} onClick={onClick} className={className}>
          {inner}
        </Link>
      </motion.div>
    );
  }
  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type={type ?? 'button'}
      disabled={disabled}
      aria-busy={busy}
      onClick={onClick}
      className={className}
      style={{ x, y }}
    >
      {inner}
    </motion.button>
  );
}

/** Small-caps mono section label — the site's section voice. */
export function SectionTag({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-sm font-mono uppercase tracking-[0.4em] text-white/40 ${className}`}
    >
      {children}
    </h2>
  );
}

/**
 * Text that develops as you scroll through it — each word sharpens from a
 * dim blur to full presence, keyed to scroll position rather than time, so
 * scrubbing up and down replays it in either direction like film.
 */
export function ScrubText({
  text,
  emphasis,
  className = '',
  style,
}: {
  text: string;
  /** Optional trailing phrase rendered at full strength once the scrub completes. */
  emphasis?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.9', 'start 0.35'],
  });

  const words = text.split(' ');

  return (
    <p ref={ref} className={className} style={style}>
      {words.map((word, i) => (
        <ScrubWord
          key={i}
          word={word}
          progress={scrollYProgress}
          range={[i / words.length, (i + 1) / words.length]}
          instant={!!reduceMotion}
        />
      ))}
      {emphasis && <span className="text-white">{emphasis}</span>}
    </p>
  );
}

function ScrubWord({
  word,
  progress,
  range,
  instant,
}: {
  word: string;
  progress: MotionValue<number>;
  range: [number, number];
  instant: boolean;
}) {
  const opacity = useTransform(progress, range, [0.13, 1]);
  const blur = useTransform(progress, range, [6, 0]);
  const filter = useTransform(blur, (b) => `blur(${b.toFixed(1)}px)`);
  const y = useTransform(progress, range, [8, 0]);

  if (instant) {
    return <span className="inline-block mr-[0.25em]">{word}</span>;
  }

  return (
    <motion.span
      className="inline-block mr-[0.25em] will-change-[opacity,filter]"
      style={{ opacity, filter, y }}
    >
      {word}
    </motion.span>
  );
}

/**
 * Reading-line focus, the way Apple Music treats lyrics: the row passing the
 * center of the viewport is at full presence; rows you haven't reached wait
 * dim and slightly offset, rows you've read settle back. Keyed to scroll
 * position, so it tracks in both directions.
 */
export function FocusRow({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.92', 'start 0.08'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.22, 1, 1, 0.4]);
  const x = useTransform(scrollYProgress, [0, 0.3], [28, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.985, 1, 1, 0.99]);

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div ref={ref} className={className} style={{ opacity, x, scale }}>
      {children}
    </motion.div>
  );
}

/**
 * A stat that rolls up like an odometer when it enters view. Handles values
 * like "40MB", "11h", "<1s", "95%" — the numeric part animates, prefix and
 * suffix hold still. Plain text when there's no number or motion is reduced.
 */
export function CountUp({
  value,
  className = '',
  style,
}: {
  value: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });

  const match = value.match(/^([^0-9]*)([\d.]+)(.*)$/);
  const target = match ? parseFloat(match[2]) : 0;
  const decimals = match ? (match[2].split('.')[1] ?? '').length : 0;

  const springValue = useSpring(0, { stiffness: 60, damping: 18, mass: 0.8 });
  const [display, setDisplay] = useState('0');

  useMotionValueEvent(springValue, 'change', (v) => {
    setDisplay(v.toFixed(decimals));
  });

  useEffect(() => {
    if (inView && target !== 0) springValue.set(target);
  }, [inView, target, springValue]);

  if (!match || reduceMotion) {
    return (
      <span className={className} style={style}>
        {value}
      </span>
    );
  }

  return (
    <span ref={ref} className={`tabular-nums ${className}`} style={style}>
      {match[1]}
      {inView ? display : '0'}
      {match[3]}
    </span>
  );
}

/** Engineering-grid backdrop used behind hero surfaces. */
export function GridBackdrop({
  rgb = '56,189,248',
  opacity = 0.08,
  size = 44,
  ...rest
}: {
  rgb?: string;
  opacity?: number;
  size?: number;
} & ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      {...rest}
      className={`absolute inset-0 pointer-events-none ${rest.className ?? ''}`}
      style={{
        opacity,
        backgroundImage: `linear-gradient(rgba(${rgb},0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(${rgb},0.4) 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
        ...rest.style,
      }}
    />
  );
}
