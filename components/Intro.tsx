'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * The seam expands from center outward, filling the screen with light.
 * One gesture: the brand concept. The threshold between both worlds.
 */
export function Intro() {
  const reduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (reduceMotion) {
      setDone(true);
      return;
    }
    if (sessionStorage.getItem('bm-intro-seen')) {
      setDone(true);
      return;
    }
    sessionStorage.setItem('bm-intro-seen', '1');

    const timer = setTimeout(() => setDone(true), 1900);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[100] bg-[#05030a] flex items-center justify-center overflow-hidden"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
        >
          {/* Seam line expands from center → fills screen with light. */}
          <motion.div
            className="absolute top-0 bottom-0 w-px bg-white"
            initial={{ scaleY: 0.1, boxShadow: '0 0 0 rgba(255,255,255,0)' }}
            animate={{
              scaleY: [0.1, 0.5, 1, 2],
              boxShadow: [
                '0 0 0 rgba(255,255,255,0)',
                '0 0 20px rgba(255,255,255,0.4)',
                '0 0 60px rgba(255,255,255,0.6)',
                '0 0 120px rgba(255,255,255,0.9)',
              ],
            }}
            transition={{
              duration: 1.4,
              ease: [0.22, 1, 0.36, 1],
              times: [0, 0.3, 0.6, 1],
            }}
            style={{ originY: 0.5 }}
          />

          {/* Left bloom (web side). */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            style={{
              background: 'linear-gradient(90deg, rgba(56,189,248,0.7) 0%, transparent 50%)',
            }}
          />

          {/* Right bloom (native side). */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            style={{
              background: 'linear-gradient(270deg, rgba(168,85,247,0.7) 0%, transparent 50%)',
            }}
          />

          {/* "both made" emerges at the seam. */}
          <motion.p
            className="relative z-10 font-bold tracking-tight text-white"
            initial={{ opacity: 0, scale: 0.7, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontSize: 'clamp(2rem, 8vw, 5rem)' }}
          >
            both<span className="text-white/50">made</span>
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
