'use client';

import { motion, useScroll, useSpring } from 'framer-motion';
import { usePathname } from 'next/navigation';

export function ScrollProgress() {
  const pathname = usePathname();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  if (pathname.startsWith('/brandon-roofing')) return null;

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-600 origin-left z-[60]"
      style={{ scaleX }}
    />
  );
}
