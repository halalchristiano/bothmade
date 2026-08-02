'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { PillCTA } from '@/components/ui';
import { BOOKING_LABEL, BOOKING_URL } from '@/lib/booking';

/**
 * The first page a new client sees after paying — and, until this rewrite,
 * the only page on the site rendered in light mode with no navigation, which
 * read like a third-party payment processor's receipt rather than the studio
 * they just hired. Same dark surface, same nav, same voice as everywhere
 * else, and it now answers "what happens next" concretely instead of just
 * pointing at a login form.
 */

const NEXT_STEPS = [
  {
    num: '01',
    title: 'Check your inbox',
    desc: 'A welcome email is on its way with your dashboard login and a temporary password. It usually lands within a minute — check spam if it doesn\'t.',
  },
  {
    num: '02',
    title: 'Book your Discovery call',
    desc: 'This is where we pin down exactly what gets built, before a line of code is written. Grab whichever slot suits you — the sooner it happens, the sooner the clock starts.',
  },
  {
    num: '03',
    title: 'Watch it get built',
    desc: 'Your dashboard tracks every stage — Discovery, Design, Build, Launch — and messages you send there reach whoever is actually writing your code, not an account manager.',
  },
];

export default function CheckoutSuccessPage() {
  return (
    <main className="relative bg-[#05030a] text-white">
      <Nav />

      <section className="relative px-6 pt-40 pb-24 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 25% 15%, rgba(16,185,129,0.14) 0%, transparent 55%)',
          }}
        />

        <div className="relative max-w-4xl mx-auto">
          <motion.div
            className="mb-10 inline-flex items-center gap-3 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span aria-hidden="true" className="text-emerald-300">
              ✓
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-emerald-300/90">
              payment received
            </span>
          </motion.div>

          <motion.h1
            className="font-bold leading-[0.95] tracking-[-0.03em]"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 5.5rem)' }}
            initial={{ opacity: 0, y: '0.3em' }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            You&apos;re in.
            <br />
            Let&apos;s get started.
          </motion.h1>

          <motion.p
            className="mt-8 max-w-xl text-lg leading-relaxed text-white/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            Your deposit is in and your project exists. We&apos;ve created your client
            dashboard and emailed you the login — from here it&apos;s Discovery, Design,
            Build, Launch, and you can see exactly where things stand at any point.
          </motion.p>

          <motion.div
            className="mt-12 flex flex-wrap items-center gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            <PillCTA href="/client/login" size="lg">
              Go to your dashboard
            </PillCTA>
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/45 hover:text-white transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/60"
            >
              {BOOKING_LABEL} →
            </a>
          </motion.div>
        </div>
      </section>

      {/* What happens next */}
      <section className="relative px-6 py-24 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-sm font-mono uppercase tracking-[0.4em] text-white/40 mb-16">
            What happens next
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {NEXT_STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                viewport={{ once: true }}
              >
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35 mb-3">
                  {step.num}
                </p>
                <h3 className="text-xl md:text-2xl font-semibold mb-3">{step.title}</h3>
                <p className="text-white/50 leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* The promises, restated at the moment they start to matter */}
      <section className="relative px-6 py-20 border-t border-white/10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h3 className="text-lg font-semibold mb-2">We don&apos;t go quiet.</h3>
            <p className="text-white/50 leading-relaxed">
              You now have a direct line to the people writing your code. If we go dark
              on your project without explanation, that&apos;s grounds for a refund — it&apos;s
              a written term, not a promise we make on a website.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">You own the code.</h3>
            <p className="text-white/50 leading-relaxed">
              Full ownership of the code and designs transfers to you once the project
              is paid in full. Until then you can review everything on staging — nothing
              about the work is hidden from you at any stage.
            </p>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-16 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <p className="text-white/40 text-sm">
            Nothing in your inbox after a few minutes, or something looks wrong?{' '}
            <Link href="/#contact" className="text-sky-300 hover:underline">
              Tell us
            </Link>{' '}
            and we&apos;ll sort it out today.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
