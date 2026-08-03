'use client';

import { motion } from 'framer-motion';
import { ContactForm } from '@/components/ContactForm';
import { Intro } from '@/components/Intro';
import { PillCTA, SectionTag, ScrubText } from '@/components/ui';
import { Nav } from '@/components/Nav';
import { SplitHero } from '@/components/SplitHero';
import { ServiceList } from '@/components/ServiceList';
import { LuxuryCursor } from '@/components/LuxuryCursor';
import { ProcessTimeline } from '@/components/ProcessTimeline';
import { WhyUs } from '@/components/WhyUs';
import { Promises } from '@/components/Promises';
import { SocialProof } from '@/components/SocialProof';
import { About } from '@/components/About';
import { Footer } from '@/components/Footer';

export default function Home() {
  return (
    <main className="relative bg-[#05030a] text-white">
      <Intro />
      <LuxuryCursor />
      <Nav />

      <SplitHero />

      <ServiceList />

      {/* Statement — develops like film, then lands on the actual offer */}
      <section className="relative py-40 px-6 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <ScrubText
            text="Most studios make you choose — a web shop that outsources mobile, or an app shop that hacks together a landing page."
            emphasis=" We do both, properly."
            className="font-medium leading-[1.15] tracking-tight"
            style={{ fontSize: 'clamp(1.75rem, 4.5vw, 3.5rem)' }}
          />

          {/* The flagship: the purchase the name promises. The plus signs are
              the brand's own syntax — Web + Native, made by one team. */}
          <motion.div
            className="mt-24 border-t border-white/10 pt-14"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10% 0px' }}
            transition={{ duration: 0.6 }}
          >
            <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.45em] text-white/40">
              the flagship build
            </p>

            <p
              className="font-bold leading-[1.1] tracking-tight"
              style={{ fontSize: 'clamp(1.6rem, 4.2vw, 3.25rem)' }}
            >
              <span
                className="text-transparent"
                style={{ WebkitTextStroke: '1.5px rgba(125,211,252,0.85)' }}
              >
                Website
              </span>
              <span className="text-white/30 mx-3 md:mx-5">+</span>
              <span className="bg-gradient-to-b from-white to-indigo-300 bg-clip-text text-transparent">
                iOS app
              </span>
              <span className="text-white/30 mx-3 md:mx-5">+</span>
              <span className="text-white/85">one shared backend.</span>
            </p>

            <div className="mt-8 flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
              <p className="max-w-md text-sm md:text-base text-white/50 leading-relaxed">
                One product, designed once, alive on every screen — no second agency, no
                handoff tax, no drift between your web and your app.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <PillCTA href="/#contact">Ask about the full build</PillCTA>
                <PillCTA href="/start" muted>See pricing</PillCTA>
              </div>
            </div>

            {/* Say the numbers before they have to ask. Figures mirror
                BASE_SERVICES in lib/pricing.ts — update both together. */}
            <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.25em] text-white/35">
              Websites from $3,000 · iOS apps from $10,000 · the full build from $20,000
            </p>
          </motion.div>
        </div>
      </section>

      {/* Process — a pipeline that draws itself as you scroll */}
      <ProcessTimeline />

      {/* Why bothmade — honest boutique-studio positioning, no invented stats */}
      <WhyUs />

      {/* The two terms that answer the objections every agency buyer has —
          going dark, and who owns the result. Both are already written into
          the agreement; this stops making people dig them out of the FAQ. */}
      <Promises />

      {/* Renders nothing until lib/testimonials.ts has a real quote in it,
          so the page is never padded with praise nobody said. */}
      <SocialProof />

      {/* Who's behind it — names and direct emails, right before we ask
          them to introduce themselves. */}
      <About />

      {/* Contact — inverted entirely. White field, dark text, form takes
          center stage. Sharp edges, generous space, no softness. */}
      <section
        id="contact"
        className="relative py-40 px-6 scroll-mt-20 bg-white text-black"
      >
        <div className="max-w-2xl mx-auto">
          <SectionTag className="mb-10 !text-black/30">Get in touch</SectionTag>
          <h2
            className="font-bold leading-[1.05] tracking-tight mb-20 text-black"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 4.5rem)' }}
          >
            Let's talk.
          </h2>
          <ContactForm />
        </div>
      </section>

      <Footer />
    </main>
  );
}
