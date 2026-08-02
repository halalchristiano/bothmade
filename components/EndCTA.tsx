'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { PillCTA } from '@/components/ui';

/**
 * The band that closes a page someone read all the way to the bottom of.
 *
 * Case studies and blog posts used to end on a "next project" / "next post"
 * link and nothing else, which sends the most engaged reader on the site
 * sideways instead of forward. This gives every one of those pages a single
 * primary action (configure and see a price) plus a lower-commitment
 * alternative for people who'd rather talk first.
 */
export function EndCTA({
  eyebrow = 'Start a project',
  title,
  sub,
  primaryLabel = 'See pricing & configure',
  primaryHref = '/start',
  secondaryLabel = 'Or just tell us about it',
  secondaryHref = '/#contact',
  accent,
}: {
  eyebrow?: string;
  title: string;
  sub: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  /** Hex pair from the host page, so the band picks up its accent wash. */
  accent?: { from: string; to: string };
}) {
  return (
    <section className="relative py-28 px-6 border-t border-white/10 overflow-hidden">
      {accent && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 15% 0%, ${accent.from}1f 0%, transparent 60%)`,
          }}
        />
      )}

      <motion.div
        className="relative max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10% 0px' }}
        transition={{ duration: 0.5 }}
      >
        <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.45em] text-white/40">
          {eyebrow}
        </p>

        <h2
          className="font-bold leading-[1.05] tracking-tight mb-6"
          style={{ fontSize: 'clamp(2rem, 6vw, 4rem)' }}
        >
          {title}
        </h2>

        <p className="text-white/45 text-lg mb-10 max-w-xl leading-relaxed">{sub}</p>

        <div className="flex flex-wrap items-center gap-5">
          <PillCTA href={primaryHref} size="lg">
            {primaryLabel}
          </PillCTA>
          <Link
            href={secondaryHref}
            className="text-sm text-white/45 hover:text-white transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/60"
          >
            {secondaryLabel}
          </Link>
        </div>

        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-white/25">
          Fixed price up front · You own the code on final payment
        </p>
      </motion.div>
    </section>
  );
}
