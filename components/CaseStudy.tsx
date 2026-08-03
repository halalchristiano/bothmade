'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { LuxuryCursor } from '@/components/LuxuryCursor';
import { ACCENT_HEX, type CaseStudy, type Shot } from '@/lib/case-studies';
import { CountUp, FocusRow, ScrubText } from '@/components/ui';
import { CtaBand } from '@/components/CtaBand';

export function CaseStudyPage({
  study,
  next,
}: {
  study: CaseStudy;
  next?: CaseStudy;
}) {
  const accent = ACCENT_HEX[study.accent];
  // Only shots with a real asset render. A shot with no src used to draw a
  // dashed "add src to lib/case-studies.ts" placeholder, which is a note to
  // ourselves showing on a client-facing page. The entries stay in the data
  // so the gallery reappears on its own once the screenshots land.
  const shots = study.shots?.filter((shot) => shot.src) ?? [];

  return (
    <main className="relative bg-[#05030a] text-white">
      <LuxuryCursor />
      <Nav />

      {/* Hero */}
      <section className="relative px-6 pt-40 pb-16 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage: `linear-gradient(${accent.from}55 1px, transparent 1px), linear-gradient(90deg, ${accent.from}55 1px, transparent 1px)`,
            backgroundSize: '44px 44px',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 25% 25%, ${accent.from}1f 0%, transparent 55%)`,
          }}
        />

        <div className="relative max-w-6xl mx-auto">
          <motion.div
            className="mb-8 flex items-center gap-4 flex-wrap"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link
              href="/work"
              className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/40 hover:text-white transition-colors"
            >
              ← Work
            </Link>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.35em]"
              style={{ color: accent.text }}
            >
              {study.discipline} · {study.year}
            </span>
            {study.status === 'in-progress' && (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full border border-white/15 text-white/35">
                in progress
              </span>
            )}
            {study.selfInitiated && (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full border border-amber-400/40 text-amber-300/90">
                our own product — not client work
              </span>
            )}
          </motion.div>

          <motion.h1
            className="font-bold leading-[0.95] tracking-[-0.03em] max-w-4xl"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 6.5rem)' }}
            initial={{ opacity: 0, y: '0.3em' }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {study.title}
          </motion.h1>

          <motion.p
            className="mt-8 max-w-xl text-lg leading-relaxed text-white/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            {study.summary}
          </motion.p>

          {/* The badge above is skimmable; this is not. A visitor deciding
              whether to trust us must know exactly what they're reading —
              a write-up of our own product in development, not a client
              engagement, with figures from our own builds. */}
          {study.selfInitiated && (
            <motion.div
              className="mt-10 max-w-xl rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
            >
              <p className="text-sm leading-relaxed text-amber-100/70">
                <span className="font-semibold text-amber-200/90">What you&apos;re reading:</span>{' '}
                {study.title} is a product we&apos;re building ourselves — not work done
                for a client. We publish these to show how we think and build; any
                figures come from our own development builds, not a customer&apos;s
                production numbers.
              </p>
            </motion.div>
          )}
        </div>
      </section>

      {/* Facts bar */}
      <section className="relative px-6 pb-24">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-lg overflow-hidden">
          {study.facts.map((fact) => (
            <div key={fact.label} className="bg-[#05030a] p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/35 mb-2">
                {fact.label}
              </p>
              <p className="text-sm text-white/80">{fact.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The problem */}
      <section className="relative px-6 py-24 border-t border-white/10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8">
          <h2 className="md:col-span-3 text-sm font-mono uppercase tracking-[0.4em] text-white/40">
            The problem
          </h2>
          <div className="md:col-span-9">
            <ScrubText
              text={study.problem}
              className="font-medium leading-[1.35] tracking-tight"
              style={{ fontSize: 'clamp(1.25rem, 2.6vw, 2rem)' }}
            />
          </div>
        </div>
      </section>

      {/* Decisions */}
      <section className="relative px-6 py-24 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-sm font-mono uppercase tracking-[0.4em] text-white/40 mb-16">
            Decisions
          </h2>

          {study.decisions.map((d, idx) => (
            <FocusRow
              key={d.title}
              className="relative border-t border-white/10 last:border-b py-10 flex flex-col md:flex-row md:items-baseline gap-3 md:gap-12"
            >
              <span
                className="font-mono text-xs md:w-16 tabular-nums"
                style={{ color: accent.text }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <h3 className="text-2xl md:text-3xl font-semibold md:w-72">{d.title}</h3>
              <p className="text-white/45 max-w-xl leading-relaxed">{d.desc}</p>
            </FocusRow>
          ))}
        </div>
      </section>

      {/* Outcome — only rendered when there is something true to report */}
      {study.outcome && (
        <section className="relative px-6 py-24 border-t border-white/10">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-sm font-mono uppercase tracking-[0.4em] text-white/40 mb-12">
              Outcome
            </h2>

            <p
              className="font-medium leading-[1.35] tracking-tight text-white/85 max-w-3xl mb-16"
              style={{ fontSize: 'clamp(1.25rem, 2.6vw, 2rem)' }}
            >
              {study.outcome.summary}
            </p>

            {study.outcome.metrics && study.outcome.metrics.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {study.outcome.metrics.map((m, idx) => (
                  <motion.div
                    key={m.label}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    viewport={{ once: true }}
                  >
                    <p
                      className="font-bold leading-none mb-3"
                      style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', color: accent.text }}
                    >
                      <CountUp value={m.value} />
                    </p>
                    <p className="text-sm text-white/45">{m.label}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Shots */}
      {shots.length > 0 && (
        <section className="relative px-6 py-24 border-t border-white/10">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-sm font-mono uppercase tracking-[0.4em] text-white/40 mb-12">
              Screens
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {shots.map((shot, idx) => (
                <ShotFrame key={idx} shot={shot} index={idx} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Links */}
      {study.links && study.links.length > 0 && (
        <section className="relative px-6 py-16 border-t border-white/10">
          <div className="max-w-6xl mx-auto flex flex-wrap gap-4">
            {study.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/20 px-6 py-3 text-sm text-white/70 hover:border-white/60 hover:text-white transition-colors"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        </section>
      )}

      {/* The read is over — offer the conversation before the next study. */}
      <CtaBand
        title="Want something built like this?"
        sub="Same people, same standards, on your product. Tell us what you're making — we reply within 24 hours."
      />

      {/* Next study */}
      {next && (
        <section className="relative border-t border-white/10">
          <Link href={`/work/${next.slug}`} className="group block px-6 py-24 relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: `linear-gradient(90deg, ${ACCENT_HEX[next.accent].from}22 0%, transparent 65%)`,
              }}
            />
            <div className="relative max-w-6xl mx-auto">
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-white/40 mb-6">
                Next project
              </p>
              <div className="flex items-baseline gap-6 flex-wrap">
                <h2
                  className="font-bold tracking-tight text-white/40 group-hover:text-white transition-colors duration-500"
                  style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}
                >
                  {next.title}
                </h2>
                <span className="text-2xl text-white/30 group-hover:text-white group-hover:translate-x-2 transition-all duration-500">
                  →
                </span>
              </div>
            </div>
          </Link>
        </section>
      )}

      <Footer />
    </main>
  );
}

function ShotFrame({
  shot,
  index,
}: {
  shot: Shot;
  index: number;
}) {
  const wide = shot.span === 'wide';

  return (
    <motion.figure
      className={wide ? 'md:col-span-2' : ''}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.5 }}
      viewport={{ once: true }}
    >
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-white/10 ${
          wide ? 'aspect-[16/9]' : 'aspect-[4/3]'
        }`}
      >
        {/* src is guaranteed — CaseStudyPage filters out shots without one. */}
        <Image
          src={shot.src!}
          alt={shot.alt}
          fill
          sizes={wide ? '(max-width: 768px) 100vw, 1152px' : '(max-width: 768px) 100vw, 576px'}
          className="object-cover"
        />
      </div>

      {shot.caption && (
        <figcaption className="mt-3 font-mono text-[11px] text-white/35">
          {shot.caption}
        </figcaption>
      )}
    </motion.figure>
  );
}
