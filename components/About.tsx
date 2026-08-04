'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { SectionTag } from '@/components/ui';
import { COMPANY_LOCATION } from '@/lib/company';
import { TEAM } from '@/lib/team';

/**
 * The credibility block. At this price point the biggest conversion leak is
 * anonymity — a visitor being asked for five figures by a site that never
 * says who is behind it. This section closes that gap with the two people
 * on every project, by name, with a direct email each.
 *
 * The people themselves live in lib/team.ts, shared with /about so the two
 * accounts of who works here can't drift apart. This section is the version
 * that has to work mid-scroll, on the way to the contact form; /about is
 * where someone goes when they've decided to check properly.
 */
/** Shared with the footer — change it in lib/company.ts, not here. */
const LOCATION: string | null = COMPANY_LOCATION;

export function About() {
  return (
    <section id="about" className="relative py-20 md:py-32 px-6 border-t border-white/10 scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16">
          <SectionTag className="mb-8">Who you&apos;re working with</SectionTag>
          <p className="text-white/50 max-w-2xl text-lg">
            Bothmade is two co-owners, and you&apos;re looking at the whole org
            chart. No sales floor, no outsourcing bench — one of us runs your
            project, the other designs and builds it, and you can email either
            directly.
          </p>
          {LOCATION && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.3em] text-white/35">
              {LOCATION}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {TEAM.map((person, i) => (
            <motion.div
              key={person.email}
              className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-8 overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: true, margin: '-10% 0px' }}
            >
              {/* accent wash, matching each person's side of the brand seam */}
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-[0.07] pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at 20% 0%, ${person.accent.from} 0%, transparent 55%)`,
                }}
              />

              <div className="relative flex items-start gap-6">
                <div
                  className="relative shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border border-white/15"
                  style={{
                    background: `linear-gradient(140deg, ${person.accent.from}30, ${person.accent.to}80)`,
                  }}
                >
                  {person.photo ? (
                    <Image
                      src={person.photo}
                      alt={`${person.name}, ${person.role.toLowerCase()} at Bothmade`}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    // No photo yet: an honest monogram, never a stock face.
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 grid place-items-center text-3xl md:text-4xl font-bold text-white/80"
                    >
                      {person.name[0]}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h3 className="text-2xl md:text-3xl font-bold text-white">{person.name}</h3>
                  <p
                    className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em]"
                    style={{ color: person.accent.from }}
                  >
                    {person.role}
                  </p>
                </div>
              </div>

              <p className="relative mt-6 text-base text-white/55 leading-relaxed">
                {person.owns}
              </p>
              {person.bio && (
                <p className="relative mt-3 text-sm text-white/40 leading-relaxed">{person.bio}</p>
              )}

              <a
                href={`mailto:${person.email}`}
                className="relative mt-6 inline-block font-mono text-xs text-white/45 hover:text-white transition-colors border-b border-white/15 hover:border-white/50 pb-0.5"
              >
                {person.email}
              </a>
            </motion.div>
          ))}
        </div>

        {/* The general inbox, for people who'd rather not pick a person. */}
        <p className="mt-10 text-sm text-white/40">
          Or write to both of us at{' '}
          <a
            href="mailto:info@bothmade.studio"
            className="text-white/70 hover:text-white transition-colors border-b border-white/20 hover:border-white/60 pb-0.5"
          >
            info@bothmade.studio
          </a>
          {' '}— everything gets answered within a day.
        </p>

        {/* The deeper version, for anyone who came here to check us out
            properly rather than to send a message. */}
        <Link
          href="/about"
          className="group mt-8 inline-flex items-center gap-3 text-sm font-medium text-white/70 hover:text-white transition-colors"
        >
          <span className="border-b border-white/25 group-hover:border-white pb-0.5 transition-colors">
            How we work, and why there are only two of us
          </span>
          <span className="transition-transform duration-300 group-hover:translate-x-1.5">→</span>
        </Link>
      </div>
    </section>
  );
}
