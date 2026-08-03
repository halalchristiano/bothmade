'use client';

import { motion } from 'framer-motion';
import { Nav } from '@/components/Nav';
import { FocusRow, PillCTA, SectionTag } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { LuxuryCursor } from '@/components/LuxuryCursor';

import type { ReactNode } from 'react';

export type ServicePageData = {
  accent: 'sky' | 'indigo' | 'purple';
  capabilities: { title: string; desc: string }[];
  stackIntro: string;
  stack: { heading: string; desc: string; items: string[] }[];
  cta: { title: string; sub: string; label: string };
};

const ACCENT = {
  sky: {
    text: 'text-sky-300',
    dim: 'text-sky-300/60',
    grid: 'rgba(56,189,248,0.30)',
    glow: 'rgba(56,189,248,0.12)',
    gradient: 'from-sky-200 via-sky-300 to-sky-500',
    chip: 'hover:border-sky-400/60',
  },
  indigo: {
    text: 'text-indigo-300',
    dim: 'text-indigo-300/60',
    grid: 'rgba(129,140,248,0.30)',
    glow: 'rgba(99,102,241,0.12)',
    gradient: 'from-indigo-200 via-indigo-300 to-indigo-500',
    chip: 'hover:border-indigo-400/60',
  },
  purple: {
    text: 'text-purple-300',
    dim: 'text-purple-300/60',
    grid: 'rgba(192,132,252,0.30)',
    glow: 'rgba(147,51,234,0.14)',
    gradient: 'from-purple-200 via-purple-300 to-purple-500',
    chip: 'hover:border-purple-400/60',
  },
};

export function ServicePage({
  data,
  hero,
}: {
  data: ServicePageData;
  hero: ReactNode;
}) {
  const a = ACCENT[data.accent];

  return (
    <main className="relative bg-[#05030a] text-white">
      <LuxuryCursor />
      <Nav />

      {/* Each platform brings its own hero — the whole point is that these
          three pages should not be interchangeable. */}
      {hero}

      {/* Capabilities. overflow-x-clip contains FocusRow's entry offset —
          the rows start 28px to the right, which pushed a horizontal
          scrollbar onto every phone. */}
      <section className="relative py-32 px-6 border-t border-white/10 overflow-x-clip">
        <div className="max-w-6xl mx-auto">
          <SectionTag className="mb-16">Capabilities</SectionTag>

          {data.capabilities.map((item, idx) => (
            <FocusRow
              key={item.title}
              className="relative border-t border-white/10 last:border-b py-10 flex flex-col md:flex-row md:items-baseline gap-3 md:gap-12"
            >
              <span className={`font-mono text-xs md:w-16 tabular-nums ${a.dim}`}>
                {String(idx + 1).padStart(2, '0')}
              </span>
              <h3 className="text-2xl md:text-3xl font-semibold md:w-72">{item.title}</h3>
              <p className="text-white/45 max-w-xl leading-relaxed">{item.desc}</p>
            </FocusRow>
          ))}
        </div>
      </section>

      {/* Stack */}
      <section className="relative py-32 px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <SectionTag className="mb-8">Stack</SectionTag>
          <p className="text-white/45 max-w-2xl leading-relaxed mb-16">{data.stackIntro}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {data.stack.map((col, idx) => (
              <motion.div
                key={col.heading}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08, duration: 0.5 }}
                viewport={{ once: true }}
              >
                <h3 className={`font-mono text-[10px] uppercase tracking-[0.35em] mb-3 ${a.dim}`}>
                  {col.heading}
                </h3>
                <p className="text-white/45 text-sm leading-relaxed mb-6">{col.desc}</p>
                <ul className="flex flex-wrap gap-2.5">
                  {col.items.map((li, i) => (
                    <motion.li
                      key={li}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 + i * 0.05 }}
                      viewport={{ once: true }}
                      className={`rounded-full border border-white/12 px-4 py-2 text-sm text-white/60 transition-all duration-300 hover:text-white hover:-translate-y-0.5 ${a.chip}`}
                    >
                      {li}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-32 px-6 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <h2
            className="font-bold leading-[1.05] tracking-tight mb-8"
            style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}
          >
            {data.cta.title}
          </h2>
          <p className="text-white/45 text-lg mb-12 max-w-lg">{data.cta.sub}</p>

          <PillCTA href="/#contact" size="lg">
            {data.cta.label}
          </PillCTA>
        </div>
      </section>

      <Footer />
    </main>
  );
}
