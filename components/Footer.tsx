'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { PillCTA } from '@/components/ui';
import { COMPANY_ADDRESS_LINES, COMPANY_EMAIL } from '@/lib/company';

const WORD = 'BOTHMADE';

/**
 * Every page ends on the brand mechanic in miniature: the wordmark sits half
 * web (wireframe sky) and half native (solid violet), and each letter flips
 * to the other identity under your pointer — with a spring pop, and it keeps
 * the new identity until touched again. Visitors leave the page playing with
 * the idea the studio is named after.
 */
function SeamWordmark() {
  // true = flipped to the opposite world.
  const [flipped, setFlipped] = useState<boolean[]>(() => WORD.split('').map(() => false));
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Each letter flips on touch, then springs home after a beat — the mark
  // plays along but always returns to composed.
  const toggle = (i: number) => {
    setFlipped((prev) => prev.map((v, j) => (j === i ? true : v)));
    clearTimeout(timers.current.get(i));
    timers.current.set(
      i,
      setTimeout(() => {
        setFlipped((prev) => prev.map((v, j) => (j === i ? false : v)));
      }, 1200)
    );
  };

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <div
      aria-hidden="true"
      className="flex justify-center overflow-hidden pt-20 pb-10 select-none"
    >
      <p
        className="font-bold leading-none tracking-[-0.04em] whitespace-nowrap"
        style={{ fontSize: 'clamp(3rem, 11.5vw, 10rem)' }}
      >
        {WORD.split('').map((ch, i) => {
          const webSide = i < 4; // BOTH | MADE
          const showsWeb = webSide !== flipped[i];

          return (
            <motion.span
              key={i}
              onPointerEnter={() => toggle(i)}
              className="inline-block cursor-default"
              whileHover={{ y: -10 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14 }}
              style={
                showsWeb
                  ? {
                      color: 'transparent',
                      WebkitTextStroke: '1.5px rgba(125,211,252,0.8)',
                    }
                  : {
                      color: 'transparent',
                      backgroundImage: 'linear-gradient(180deg, #fff 30%, #d8b4fe)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                    }
              }
            >
              {ch}
            </motion.span>
          );
        })}
      </p>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 relative overflow-hidden">
      <SeamWordmark />

      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          <div>
            <h3 className="text-2xl font-bold mb-3">bothmade</h3>
            <p className="text-white/40 text-sm max-w-xs">
              Web and native Apple development. One team, from first sketch to App Store.
            </p>
            {/* A real address is a trust signal all on its own — and it's the
                same one the invoices carry, so a client checking one against
                the other finds them identical. */}
            <address className="mt-5 not-italic text-white/30 text-xs leading-relaxed">
              {COMPANY_ADDRESS_LINES.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <a
              href={`mailto:${COMPANY_EMAIL}`}
              className="mt-3 inline-block text-xs text-white/40 hover:text-sky-300 transition"
            >
              {COMPANY_EMAIL}
            </a>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-4 text-white/70">Services</h4>
            <ul className="space-y-2 text-sm text-white/40">
              {[
                { label: 'Web Development', href: '/web' },
                { label: 'iOS & iPad Apps', href: '/ios' },
                { label: 'Vision Pro', href: '/visionpro' },
                { label: 'Work', href: '/work' },
                { label: 'Blog', href: '/blog' },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-sky-300 transition">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-4 text-white/70">Start a project</h4>
            <div className="flex flex-col items-start gap-4">
              <PillCTA href="/start">See pricing →</PillCTA>
              <Link href="/client/login" className="text-sm text-white/40 hover:text-sky-300 transition">
                Existing client? Log in
              </Link>
            </div>
          </div>
        </div>

        <motion.div
          className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between gap-4 text-sm text-white/30"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <p>© 2026 Bothmade. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-sky-300 transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-sky-300 transition">
              Terms
            </Link>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
