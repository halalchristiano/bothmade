'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { LuxuryCursor } from '@/components/LuxuryCursor';
import { PillCTA } from '@/components/ui';

import { CASE_STUDIES, ACCENT_HEX } from '@/lib/case-studies';

export function WorkIndex() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <main className="relative bg-[#05030a] text-white">
      <LuxuryCursor />
      <Nav />

      {/* Header */}
      <section className="relative px-6 pt-40 pb-20">
        <div className="max-w-6xl mx-auto">
          <motion.p
            className="mb-8 font-mono text-[10px] uppercase tracking-[0.45em] text-white/40"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            selected work
          </motion.p>

          <motion.h1
            className="font-bold leading-[0.95] tracking-[-0.03em] max-w-4xl"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 6.5rem)' }}
            initial={{ opacity: 0, y: '0.3em' }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            We&apos;re building
            <br />
            our first shelf.
          </motion.h1>

          <motion.p
            className="mt-10 max-w-xl text-base md:text-lg leading-relaxed text-white/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Bothmade is new, and we&apos;d rather show you nothing than show you someone
            else&apos;s work. Our own products are in development now — each one will be
            written up here properly: the problem, the decisions, and what actually happened
            after launch.
          </motion.p>
        </div>
      </section>

      {/* Project slots */}
      <section className="relative px-6 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-10 flex-wrap gap-4">
            <h2 className="text-sm font-mono uppercase tracking-[0.4em] text-white/40">
              In the works
            </h2>
            <span className="font-mono text-sm text-white/25">
              {String(CASE_STUDIES.length).padStart(2, '0')} projects
            </span>
          </div>

          <div>
            {CASE_STUDIES.map((p, idx) => {
              const accent = ACCENT_HEX[p.accent];

              return (
                <motion.article
                  key={p.slug}
                  className="group relative border-t border-white/10 last:border-b overflow-hidden"
                  onMouseEnter={() => setActive(p.slug)}
                  onMouseLeave={() => setActive(null)}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.07, duration: 0.5 }}
                  viewport={{ once: true }}
                >
                  {/* accent wash on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: `linear-gradient(90deg, ${accent.from}22 0%, transparent 60%)`,
                    }}
                  />

                  <Link
                    href={`/work/${p.slug}`}
                    className="relative py-10 grid md:grid-cols-12 gap-4 md:gap-8 items-baseline"
                  >
                    <span className="md:col-span-1 font-mono text-xs text-white/25 tabular-nums">
                      {String(idx + 1).padStart(2, '0')}
                    </span>

                    <h3 className="md:col-span-4 text-2xl md:text-3xl font-semibold text-white/35 group-hover:text-white transition-colors duration-500">
                      {p.title}
                    </h3>

                    <p className="md:col-span-4 text-white/40 text-sm leading-relaxed">
                      {p.summary}
                    </p>

                    <span className="md:col-span-2 font-mono text-xs text-white/30">
                      {p.discipline} · {p.year}
                    </span>

                    <span className="md:col-span-1 md:text-right">
                      <span
                        className={`inline-block font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full border ${
                          p.status === 'live'
                            ? 'border-emerald-400/40 text-emerald-300/80'
                            : 'border-white/15 text-white/35'
                        }`}
                      >
                        {p.status === 'live' ? 'live' : 'wip'}
                      </span>
                    </span>
                  </Link>

                  {/* progress hairline */}
                  <div
                    className="absolute bottom-0 left-0 h-px transition-all duration-700 ease-out pointer-events-none"
                    style={{
                      width: active === p.slug ? '100%' : '0%',
                      background: `linear-gradient(90deg, ${accent.from}, ${accent.to})`,
                    }}
                  />
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Honest CTA */}
      <section className="relative py-32 px-6 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <h2
            className="font-bold leading-[1.05] tracking-tight mb-8"
            style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}
          >
            Want to be the
            <br />
            first case study?
          </h2>
          <p className="text-white/45 text-lg mb-12 max-w-lg">
            Early clients get our full attention and honest pricing. Configure what
            you&apos;re building and see the number in about a minute — no call required
            to find out what it costs.
          </p>

          <div className="flex flex-wrap items-center gap-6">
            <PillCTA href="/start" size="lg">
              See pricing &amp; configure
            </PillCTA>
            <Link
              href="/#contact"
              className="text-sm text-white/45 hover:text-white transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/60"
            >
              Or just tell us about it
            </Link>
          </div>

          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-white/25">
            Fixed price up front · You own the code on final payment
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
