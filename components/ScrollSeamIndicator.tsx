'use client';

import { useScroll, useTransform, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

/**
 * The seam line becomes a living scroll indicator. A thin vertical line
 * on the right edge that grows from top to bottom as you scroll.
 * The brand concept made tactile throughout the entire site.
 */
export function ScrollSeamIndicator() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      ref={ref}
      className="fixed right-0 top-0 w-px h-screen bg-gradient-to-b from-white via-white to-transparent pointer-events-none z-40"
      style={{
        scaleY: scrollYProgress,
        transformOrigin: 'top center',
      }}
    />
  );
}
