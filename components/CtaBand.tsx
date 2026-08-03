'use client';

import { motion } from 'framer-motion';
import { PillCTA } from '@/components/ui';

/**
 * The exit ramp for content pages. Blog posts and case studies earn a
 * visitor's attention and then — before this existed — handed them a footer.
 * Every content page ends with a route into a conversation instead.
 */
export function CtaBand({
  title = 'Have a project like this in mind?',
  sub = 'Tell us what you’re building — we reply within 24 hours, and you’ll be talking to the people doing the work.',
}: {
  title?: string;
  sub?: string;
}) {
  return (
    <section className="relative py-24 md:py-32 px-6 border-t border-white/10">
      <div className="max-w-4xl mx-auto">
        <motion.h2
          className="font-bold leading-[1.05] tracking-tight mb-6"
          style={{ fontSize: 'clamp(1.75rem, 5vw, 3.5rem)' }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true, margin: '-10% 0px' }}
        >
          {title}
        </motion.h2>
        <p className="text-white/45 text-base md:text-lg mb-10 max-w-lg leading-relaxed">{sub}</p>
        <div className="flex flex-wrap items-center gap-4">
          <PillCTA href="/#contact" size="lg">
            Start a conversation
          </PillCTA>
          <PillCTA href="/start" muted>
            See transparent pricing
          </PillCTA>
        </div>
      </div>
    </section>
  );
}
