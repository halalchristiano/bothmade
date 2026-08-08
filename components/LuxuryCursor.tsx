'use client';

import { useEffect, useRef, useState } from 'react';

const INTERACTIVE = 'a, button, [role="slider"], input, select, textarea';

/**
 * Whether the surface under the pointer is light enough that a sky-300 dot
 * would disappear into it.
 *
 * Measured rather than declared. The alternative is tagging every light
 * section by hand, which is correct exactly until somebody adds one and
 * doesn't know the cursor needs telling — and the failure is invisible to
 * whoever ships it, because they are looking at the section, not the
 * pointer. Walking up for the nearest painted ancestor costs one
 * getComputedStyle per element boundary crossed, not per frame.
 *
 * Backgrounds below 0.5 alpha are treated as see-through and skipped: a
 * white/5 overlay on near-black is still a dark surface.
 */
function isOnLightSurface(start: Element | null): boolean {
  for (let el = start; el && el !== document.documentElement; el = el.parentElement) {
    const parts = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
    if (!parts) continue;

    const [r, g, b, a = '1'] = parts;
    if (Number(a) < 0.5) continue;

    // Relative luminance, the same weighting the contrast maths uses.
    const luminance = (0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b)) / 255;
    return luminance > 0.55;
  }
  return false;
}

export function LuxuryCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [onLight, setOnLight] = useState(false);

  useEffect(() => {
    const dot = dotRef.current;
    const trail = trailRef.current;
    if (!dot || !trail) return;

    // Only hide the native cursor once we know this code is actually running.
    // Doing it in CSS at render time would leave anyone with failed or slow
    // hydration staring at a page with no pointer at all.
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return;

    /*
     * Leave the real cursor alone for anyone who asked for less motion.
     *
     * Two separate reasons, and the second is the one that matters more.
     *
     * The trail is a lerp driven by requestAnimationFrame — an element that
     * visibly lags and chases the pointer, which is the shape of motion
     * prefers-reduced-motion exists to suppress. The reduced-motion block in
     * globals.css cannot reach it: that flattens animation-duration and
     * transition-duration, and this position is written straight to
     * `style.transform` every frame, which neither of those touches. So the
     * site's own policy stopped exactly here.
     *
     * And `.has-lux-cursor { cursor: none }` removes the *system* cursor
     * entirely, replacing it with a 6px dot. Anyone running a large,
     * high-contrast or otherwise customised OS pointer — which is a setting
     * people turn on to be able to find it at all — loses it and gets the
     * dot. Reduced motion is the closest signal a browser gives us that
     * someone wants their own machine's behaviour rather than ours.
     *
     * Returning before the class is added leaves the two elements rendered at
     * opacity-0 and the native cursor untouched, which is exactly what the
     * touch-device path above already does.
     */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
      setOnLight(isOnLightSurface(target));
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
      {/* Two palettes, because one cursor crosses both grounds. sky-300 is
          the brand blue and reads well on the near-black the site mostly
          is, but it sits at about 1.3:1 against the white contact panel —
          and the hover state made it white on white, which is how it came
          to erase the placeholder it was resting on rather than sit over
          it. On a light surface it keeps the blue and drops to sky-600
          (~4.4:1 on white), and the hover state inverts to black, mirroring
          what white does against the dark. */}
      <div
        ref={dotRef}
        aria-hidden="true"
        className={`lux-cursor fixed top-0 left-0 pointer-events-none z-[70] rounded-full opacity-0 transition-[width,height,background-color] duration-200 ${
          hovering ? 'w-4 h-4' : 'w-1.5 h-1.5'
        } ${
          onLight
            ? hovering
              ? 'bg-black'
              : 'bg-sky-600'
            : hovering
              ? 'bg-white'
              : 'bg-sky-300'
        }`}
      />
      <div
        ref={trailRef}
        aria-hidden="true"
        className={`lux-cursor fixed top-0 left-0 pointer-events-none z-[69] rounded-full border opacity-0 transition-[width,height,border-color] duration-300 ${
          hovering ? 'w-14 h-14' : 'w-9 h-9'
        } ${
          onLight
            ? hovering
              ? 'border-black/45'
              : 'border-sky-600/45'
            : hovering
              ? 'border-white/50'
              : 'border-sky-300/35'
        }`}
      />
    </>
  );
}
