'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { SectionTag } from '@/components/ui';

const PHASES = [
  {
    num: '01',
    title: 'Discovery',
    desc: 'We dig into your goals, users, and constraints before writing a line of code. That means real conversations with the people who\'ll use it, a look at what\'s worked and what hasn\'t, and a scoped plan you sign off before anything gets built.',
    tag: 'week 0–1',
  },
  {
    num: '02',
    title: 'Design',
    desc: 'Interface and interaction design that earns its keep. Every pixel is deliberate — we design in the browser or in Figma against real content, not placeholder text, so what you approve is what actually ships.',
    tag: 'weeks 1–3',
  },
  {
    num: '03',
    title: 'Build',
    desc: 'Weekly builds you can actually use. No black boxes, no surprises at the end — you get a working link every week, and your feedback shapes the next one instead of arriving after it\'s too late to change course.',
    tag: 'weeks 3–9',
  },
  {
    num: '04',
    title: 'Launch',
    desc: 'App Store submission, deployment, monitoring. We stay through go-live and beyond, watching for the issues that only show up under real traffic and fixing them before they become your problem to explain.',
    tag: 'week 10+',
  },
];

/**
 * Bold reimagining: each phase is a full-width card you scroll through.
 * Progress indicator at bottom center shows how far through the timeline.
 * No vertical rail, just horizontal momentum through four distinct chapters.
 */
export function ProcessTimeline() {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.2', 'end 0.8'],
  });

  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section ref={containerRef} className="relative py-20 md:py-32 px-6 border-t border-white/10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-20">
          <SectionTag className="mb-8">How we work</SectionTag>
          <p className="text-white/50 max-w-2xl">
            Four phases. Each one transparent, measured, and built with you.
          </p>
        </div>

        {/* Four full-width phase cards */}
        <div className="space-y-10 md:space-y-16">
          {PHASES.map((phase, i) => (
            <motion.div
              key={i}
              className="relative p-8 md:p-10 border-l-2 border-white/20"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              viewport={{ once: false, margin: '-20% 0px' }}
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                <div className="flex-1">
                  <p className="text-sm font-mono uppercase tracking-[0.3em] text-white/40 mb-2">
                    {phase.num}
                  </p>
                  <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">{phase.title}</h3>
                  <p className="text-base md:text-lg text-white/60 leading-relaxed max-w-2xl">
                    {phase.desc}
                  </p>
                </div>
                <div className="shrink-0 text-sm font-mono uppercase tracking-[0.2em] text-white/30">
                  {phase.tag}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Progress indicator at bottom */}
        {!reduceMotion && (
          <div className="mt-24 md:mt-32 flex justify-center">
            <div className="relative w-full max-w-xs h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400"
                style={{ width: progressWidth }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
