'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { CountUp, SectionTag } from '@/components/ui';
import { PROOF_STATS, TESTIMONIALS } from '@/lib/testimonials';

/**
 * Testimonials and proof numbers — rendered only once there are real ones.
 *
 * While lib/testimonials.ts is empty this returns null, so the homepage has
 * no hole in it and no fabricated praise in it either. The section exists
 * fully built so the first real quote is a one-line data change, not a
 * design task nobody gets around to.
 */
export function SocialProof() {
  if (TESTIMONIALS.length === 0 && PROOF_STATS.length === 0) return null;

  return (
    <section className="relative py-32 px-6 border-t border-white/10">
      <div className="max-w-6xl mx-auto">
        <SectionTag className="mb-16">What clients say</SectionTag>

        {PROOF_STATS.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20">
            {PROOF_STATS.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                viewport={{ once: true }}
              >
                <p
                  className="font-bold leading-none mb-3 bg-gradient-to-b from-white to-sky-300 bg-clip-text text-transparent"
                  style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}
                >
                  <CountUp value={stat.value} />
                </p>
                <p className="text-sm text-white/45">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        )}

        {TESTIMONIALS.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TESTIMONIALS.map((t, idx) => (
              <motion.figure
                key={`${t.company}-${idx}`}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-8"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07, duration: 0.5 }}
                viewport={{ once: true, margin: '-10% 0px' }}
              >
                <blockquote className="text-lg leading-relaxed text-white/80">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-6 pt-6 border-t border-white/10 text-sm">
                  <span className="text-white/80 font-medium">{t.name}</span>
                  <span className="text-white/40">
                    {' '}
                    — {t.role}, {t.company}
                  </span>
                  {t.project && (
                    <span className="block mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
                      {t.project}
                    </span>
                  )}
                  {t.href && (
                    <Link
                      href={t.href}
                      className="mt-3 inline-block text-sky-300 hover:underline"
                    >
                      See the project →
                    </Link>
                  )}
                </figcaption>
              </motion.figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
