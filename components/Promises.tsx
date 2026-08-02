'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

/**
 * The two promises that were previously buried — one in the /start FAQ, one
 * in the contract — pulled up to headline size.
 *
 * "We don't go quiet" is the single objection every agency buyer has been
 * burned by before, and code ownership on final payment is the one they're
 * usually afraid to ask about. Both are already true and already written
 * into the agreement; this section just stops making people dig for them.
 */

const PROMISES = [
  {
    headline: "We don't go quiet.",
    body: "The number one thing that goes wrong with an agency is that they stop replying. Ours is a written term, not a vibe: if we go dark on your project for an extended stretch with no explanation, that's grounds for a refund — spelled out in the agreement you read before paying anything beyond the deposit.",
    proof: 'Written into every agreement',
    href: '/blog/we-dont-disappear-after-launch',
    linkLabel: 'Read why we put it in writing',
  },
  {
    headline: 'You own the code.',
    body: 'Full ownership of the code and the designs transfers to you the moment the project is paid in full — no license fee, no hostage situation, no "our platform" you can only leave by rebuilding. You can review everything on staging the whole way through, and walk away with all of it at the end.',
    proof: 'Transfers on final payment',
    href: '/start',
    linkLabel: 'See the full terms',
  },
];

export function Promises() {
  return (
    <section className="relative py-24 md:py-32 px-6 border-t border-white/10">
      <div className="max-w-6xl mx-auto">
        <p className="mb-14 font-mono text-[10px] uppercase tracking-[0.45em] text-white/40">
          our promises to you
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
          {PROMISES.map((p, i) => (
            <motion.div
              key={p.headline}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true, margin: '-10% 0px' }}
            >
              <h3
                className="font-bold leading-[1.05] tracking-tight mb-5 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent"
                style={{ fontSize: 'clamp(2rem, 4.5vw, 3.25rem)' }}
              >
                {p.headline}
              </h3>

              <p className="text-base md:text-lg text-white/55 leading-relaxed max-w-lg mb-6">
                {p.body}
              </p>

              <div className="flex items-center gap-4 flex-wrap">
                <span className="inline-block rounded-full border border-emerald-400/30 bg-emerald-400/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-300/80">
                  {p.proof}
                </span>
                <Link
                  href={p.href}
                  className="text-sm text-white/45 hover:text-white transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/60"
                >
                  {p.linkLabel}
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
