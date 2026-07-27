'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Nav } from '@/components/Nav';
import { PillCTA } from '@/components/ui';

/**
 * Branded failure state. Without this, a thrown error in any client
 * component hands visitors Next's unstyled default — the one screen a
 * studio selling polish can never afford to show.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative min-h-screen bg-[#05030a] text-white flex items-center px-6 overflow-hidden">
      <Nav />

      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(192,132,252,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(192,132,252,0.3) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <div className="relative max-w-4xl mx-auto w-full">
        <motion.p
          className="mb-8 font-mono text-[10px] uppercase tracking-[0.45em] text-white/40"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          something broke
        </motion.p>

        <motion.h1
          className="font-bold leading-[0.9] tracking-[-0.03em]"
          style={{ fontSize: 'clamp(3rem, 12vw, 9rem)' }}
          initial={{ opacity: 0, y: '0.3em' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className="text-transparent"
            style={{ WebkitTextStroke: '1.5px rgba(216,180,254,0.8)' }}
          >
            Un
          </span>
          <span className="bg-gradient-to-b from-white to-purple-300 bg-clip-text text-transparent">
            made.
          </span>
        </motion.h1>

        <motion.p
          className="mt-10 max-w-md text-white/45 leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Something went wrong on our side. It&apos;s logged, and trying again usually works.
        </motion.p>

        <motion.div
          className="mt-12 flex flex-wrap gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <PillCTA onClick={reset}>Try again</PillCTA>
          <PillCTA href="/" muted>
            Back home
          </PillCTA>
        </motion.div>
      </div>
    </main>
  );
}
