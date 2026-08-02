'use client';

import { motion } from 'framer-motion';
import { SectionTag } from '@/components/ui';

const PRINCIPLES = [
  {
    num: '01',
    title: 'Direct access',
    desc: 'No account manager relaying your notes to a dev team you never meet. You talk to the person actually writing the code.',
  },
  {
    num: '02',
    title: 'One team, every surface',
    desc: "Web and native aren't stitched together after the fact by two separate shops. Same people, same codebase philosophy, start to finish.",
  },
  {
    num: '03',
    title: 'Fixed scope, fixed price',
    desc: 'You see the number before we start. It only moves if you ask for more — never as a surprise line item at the end.',
  },
  {
    num: '04',
    title: 'Built to last',
    desc: "We reach for boring, proven tools over trendy ones that won't be maintained in two years. Your product outlives the trend cycle.",
  },
  {
    num: '05',
    title: 'Still here after launch',
    desc: "Shipping isn't the exit. We stay on to fix what breaks, ship what you learn from real users, and answer the phone when something's wrong.",
  },
];

/** Boutique-studio positioning, honestly scoped — no invented headcount or client-count claims. */
export function WhyUs() {
  return (
    <section className="relative py-20 md:py-32 px-6 border-t border-white/10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16">
          <SectionTag className="mb-8">Why bothmade</SectionTag>
          <p className="text-white/50 max-w-2xl text-lg">
            We stayed a two-person studio on purpose. Here's what that actually buys you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-12">
          {PRINCIPLES.map((p, i) => (
            <motion.div
              key={p.num}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              viewport={{ once: true, margin: '-10% 0px' }}
            >
              <p className="text-sm font-mono uppercase tracking-[0.3em] text-white/40 mb-3">{p.num}</p>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">{p.title}</h3>
              <p className="text-base text-white/55 leading-relaxed max-w-md">{p.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-20 md:mt-28 pt-16 border-t border-white/10"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true, margin: '-10% 0px' }}
        >
          <p className="text-sm font-mono uppercase tracking-[0.3em] text-white/40 mb-4">
            Who's behind it
          </p>
          <p className="text-base md:text-lg text-white/60 leading-relaxed max-w-2xl">
            Bothmade is run by <span className="text-white/85 font-medium">Evan</span> and{' '}
            <span className="text-white/85 font-medium">Kiana</span>, working out of London
            and Delaware. No account managers, no outsourced dev shop — you work directly
            with the two people building your product.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
