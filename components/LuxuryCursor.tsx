'use client';

import { useEffect, useRef, useState } from 'react';

const INTERACTIVE = 'a, button, [role="slider"], input, select, textarea';

export function LuxuryCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const dot = dotRef.current;
    const trail = trailRef.current;
    if (!dot || !trail) return;

    // Only hide the native cursor once we know this code is actually running.
    // Doing it in CSS at render time would leave anyone with failed or slow
    // hydration staring at a page with no pointer at all.
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return;
    document.documentElement.classList.add('has-lux-cursor');

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let trailX = mouseX;
    let trailY = mouseY;
    let visible = false;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!visible) {
        visible = true;
        trailX = mouseX;
        trailY = mouseY;
        dot.style.opacity = '1';
        trail.style.opacity = '1';
      }
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      setHovering(Boolean(target?.closest?.(INTERACTIVE)));
    };

    const onLeave = () => {
      visible = false;
      dot.style.opacity = '0';
      trail.style.opacity = '0';
    };

    // Easing runs on the frame clock, not the mousemove clock. Driving it from
    // pointer events meant the trail froze mid-flight whenever the mouse
    // stopped, and eased faster on high-polling-rate mice.
    let frame: number;
    const tick = () => {
      trailX += (mouseX - trailX) * 0.18;
      trailY += (mouseY - trailY) * 0.18;

      // translate3d keeps this on the compositor; left/top would force layout
      // on every single frame.
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      trail.style.transform = `translate3d(${trailX}px, ${trailY}px, 0) translate(-50%, -50%)`;

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseleave', onLeave);
      document.documentElement.classList.remove('has-lux-cursor');
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        aria-hidden="true"
        className={`lux-cursor fixed top-0 left-0 pointer-events-none z-[70] rounded-full bg-sky-300 opacity-0 transition-[width,height,background-color] duration-200 ${
          hovering ? 'w-4 h-4 bg-white' : 'w-1.5 h-1.5'
        }`}
      />
      <div
        ref={trailRef}
        aria-hidden="true"
        className={`lux-cursor fixed top-0 left-0 pointer-events-none z-[69] rounded-full border opacity-0 transition-[width,height,border-color] duration-300 ${
          hovering ? 'w-14 h-14 border-white/50' : 'w-9 h-9 border-sky-300/35'
        }`}
      />
    </>
  );
}
