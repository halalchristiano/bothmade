'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { scrollEdges } from '@/lib/scroll-edges';

/**
 * The admin sidebar's nav list, with an edge that admits there is more of it.
 *
 * ## What was wrong
 *
 * The nav is `flex-1 overflow-y-auto` inside a full-height sidebar, so on a
 * short window it scrolls. Measured on the real page: the list wants 772px,
 * and gets 651 at 1920×900, 551 at 1280×800, 451 at 1440×700 — a laptop with
 * a browser toolbar and a dock, which is most laptops.
 *
 * At 1440×700 that hides seven items — Priorities, Clients, Projects,
 * Analytics, Team Chat, Team and **Settings** — and slices Priorities through
 * its middle against the footer's top border, so the cut looks like the rule
 * that ends a list. Nothing on screen suggested scrolling, and the one cue
 * that would have, the scrollbar, is styled in
 * globals.css at 10% white on the deliberate understanding that "a scrollbar
 * is furniture, not a feature". That is the right call on every other surface
 * in the app; on `#070510`, the darkest one, it renders to nothing.
 *
 * So: two correct decisions, and between them a person who cannot find
 * Settings.
 *
 * ## The fix
 *
 * Fade the content out against the sidebar's own colour at whichever end has
 * something hidden behind it. A dissolving row reads as "there is more" the
 * way a cleanly sliced one never does, and it works regardless of how the
 * scrollbar is themed.
 *
 * Both fades are conditional, which is the part worth being careful about. A
 * permanent bottom fade would leave the final item half-dimmed once you had
 * scrolled all the way to it, and a dimmed last item looks like a rendering
 * fault, not an invitation. `scrollEdges` decides; this only draws.
 *
 * `aria-hidden` and `pointer-events-none` throughout — this is a hint about
 * geometry, and a screen reader is already told the whole list.
 */
export function SidebarScroll({
  children,
  className = '',
  /** The surface the fade dissolves into. Must match the sidebar, or it smudges. */
  fadeColor = '#070510',
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  fadeColor?: string;
  'aria-label'?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  // Starts as "everything fits" so a nav that does never flashes a fade on
  // the first paint, before anything has been measured.
  const [edges, setEdges] = useState({ atTop: true, atBottom: true, fits: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges(
      scrollEdges({
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      })
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measure();

    // The window resizing is the obvious trigger; the list's own height
    // changing is the one that gets forgotten. Both ends move when a nav item
    // appears for a role, or when the unread badge wraps a label onto a
    // second line.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    return () => observer.disconnect();
  }, [measure, children]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/*
        The scroll sizing lives here rather than in the className the caller
        passes, because it is what makes the fades line up: `min-h-0` is what
        lets a flex item shrink below its content at all, and without it the
        nav grows past the sidebar and nothing scrolls or fades.
      */}
      <nav
        ref={ref}
        aria-label={ariaLabel}
        onScroll={measure}
        className={`min-h-0 flex-1 overflow-y-auto ${className}`}
      >
        {children}
      </nav>

      {!edges.atTop && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-6"
          style={{ backgroundImage: `linear-gradient(to bottom, ${fadeColor}, transparent)` }}
        />
      )}

      {!edges.atBottom && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
          style={{ backgroundImage: `linear-gradient(to top, ${fadeColor}, transparent)` }}
        />
      )}
    </div>
  );
}
