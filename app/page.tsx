'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useState, FormEvent } from 'react';
import { Intro } from '@/components/Intro';
import { PillCTA, SectionTag, ScrubText } from '@/components/ui';
import { Nav } from '@/components/Nav';
import { SplitHero } from '@/components/SplitHero';
import { ServiceList } from '@/components/ServiceList';
import { LuxuryCursor } from '@/components/LuxuryCursor';
import { ProcessTimeline } from '@/components/ProcessTimeline';
import { Footer } from '@/components/Footer';

function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
    service: 'web',
    website: '', // honeypot — hidden from humans, irresistible to bots
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitted(true);
        setFormData({
          name: '',
          email: '',
          company: '',
          message: '',
          service: 'web',
          website: '',
        });
        setTimeout(() => setSubmitted(false), 4000);
      } else {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? 'Failed to send message. Please try again.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Bold, minimal form. Large fields, generous space, underlines only.
  // Dark ink on white, no softness.
  const field =
    'w-full bg-transparent border-0 border-b-2 border-black/20 rounded-none px-0 py-5 text-lg md:text-xl text-black placeholder-black/25 focus:outline-none focus:border-black/60 transition-colors duration-200';

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Honeypot. Hidden from sighted users and screen readers alike, and
          skipped by tab order — only a bot filling every field will trip it. */}
      <div aria-hidden="true" className="absolute w-px h-px -left-[9999px] overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={formData.website}
          onChange={handleChange}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-x-10">
        <input
          type="text"
          name="name"
          aria-label="Your name"
          autoComplete="name"
          placeholder="Name"
          value={formData.name}
          onChange={handleChange}
          required
          className={field}
        />
        <input
          type="email"
          name="email"
          aria-label="Your email address"
          autoComplete="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
          className={field}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-x-10">
        <input
          type="text"
          name="company"
          aria-label="Company (optional)"
          autoComplete="organization"
          placeholder="Company"
          value={formData.company}
          onChange={handleChange}
          className={field}
        />
        <span className="relative block">
          <select
            name="service"
            aria-label="What do you need built?"
            value={formData.service}
            onChange={handleChange}
            className={`${field} cursor-pointer appearance-none pr-8`}
          >
            <option value="web">Web</option>
            <option value="ios">iOS &amp; iPad</option>
            <option value="mac">macOS</option>
            <option value="visionpro">Vision Pro</option>
            <option value="full-stack">Everything</option>
            <option value="other">Something else</option>
          </select>
          {/* appearance-none erased the native chevron — without one this
              reads as a text field, not a menu */}
          <svg
            aria-hidden="true"
            viewBox="0 0 12 8"
            className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-2 text-black/40"
          >
            <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </div>

      <textarea
        name="message"
        aria-label="Tell us about the project"
        placeholder="Tell us about the project"
        value={formData.message}
        onChange={handleChange}
        required
        rows={4}
        className={`${field} resize-none`}
      />

      {/* Always mounted so assistive tech is already watching it when the
          result arrives — a live region added at the same time as its content
          is announced unreliably. */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {submitted && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-4 font-mono text-xs uppercase tracking-[0.3em] text-emerald-700"
          >
            Message received — we&apos;ll reply within 24h
          </motion.p>
        )}

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-4 font-mono text-xs uppercase tracking-[0.3em] text-red-600"
          >
            {error}
          </motion.p>
        )}
      </div>

      <div className="pt-12">
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="w-full md:w-auto px-10 py-5 md:py-6 bg-black text-white font-medium text-base md:text-lg transition-all duration-300 hover:bg-black/85 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

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
              <PillCTA href="/start">Price the full build</PillCTA>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Process — a pipeline that draws itself as you scroll */}
      <ProcessTimeline />

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
            Let's build something great.
          </h2>

          {/* Two doors, on purpose: some people want to ask one question, and
              some want the number before they'll write a word. */}
          <p className="-mt-12 mb-16 text-base text-black/50">
            Want the number first?{' '}
            <Link
              href="/start"
              className="font-medium text-black underline decoration-black/30 underline-offset-4 transition hover:decoration-black"
            >
              Build an estimate in two minutes
            </Link>{' '}
            — published prices, every add-on labelled.
          </p>

          <ContactForm />
        </div>
      </section>

      <Footer />
    </main>
  );
}
