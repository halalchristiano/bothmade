'use client';

import { motion } from 'framer-motion';
import { Nav } from '@/components/Nav';
import { PillCTA } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="relative min-h-screen bg-[#05030a] text-white flex items-center px-6 overflow-hidden">
      <Nav />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(56,189,248,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.3) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <div className="relative max-w-4xl mx-auto w-full">
        <motion.p
          className="mb-8 font-mono text-[10px] uppercase tracking-[0.45em] text-white/40"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          error 404
        </motion.p>

        <motion.h1
          className="font-bold leading-[0.9] tracking-[-0.03em]"
          style={{ fontSize: 'clamp(3rem, 13vw, 10rem)' }}
          initial={{ opacity: 0, y: '0.3em' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className="text-transparent"
            style={{ WebkitTextStroke: '1.5px rgba(125, 211, 252, 0.8)' }}
          >
            Not
          </span>{' '}
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
          This page doesn&apos;t exist — or it did, and we moved it. Either way, the way back
          is below.
        </motion.p>

        <motion.div
          className="mt-12 flex flex-wrap gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <PillCTA href="/">Back home</PillCTA>
          <PillCTA href="/#contact" muted>
            Get in touch
          </PillCTA>
        </motion.div>
      </div>
    </main>
  );
}
