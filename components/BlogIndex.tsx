'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { LuxuryCursor } from '@/components/LuxuryCursor';
import { FocusRow } from '@/components/ui';
import { BLOG_POSTS, formatBlogDate } from '@/lib/blog';

const ACCENT_HEX: Record<string, { from: string; to: string }> = {
  sky: { from: '#0ea5e9', to: '#0c2f52' },
  indigo: { from: '#6366f1', to: '#1e1b4b' },
  purple: { from: '#a855f7', to: '#3b0764' },
};

export function BlogIndex() {
  const sorted = [...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));

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
            notes
          </motion.p>

          <motion.h1
            className="font-bold leading-[0.95] tracking-[-0.03em] max-w-4xl"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 6.5rem)' }}
            initial={{ opacity: 0, y: '0.3em' }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            How we build,
            <br />
            written down.
          </motion.h1>

          <motion.p
            className="mt-10 max-w-xl text-base md:text-lg leading-relaxed text-white/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Decisions, tools, and tradeoffs from actual projects — no filler, no
            listicles written to rank.
          </motion.p>
        </div>
      </section>

      {/* Posts */}
      <section className="relative px-6 pb-24">
        <div className="max-w-6xl mx-auto">
          {sorted.length === 0 ? (
            <div className="border-t border-b border-white/10 py-24 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/30">
                First post is in progress — check back soon.
              </p>
            </div>
          ) : (
            <div>
              {sorted.map((post, idx) => {
                const accent = ACCENT_HEX[post.accent];
                return (
                  <FocusRow key={post.slug} className="border-t border-white/10 last:border-b">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="group relative block py-10 grid md:grid-cols-12 gap-4 md:gap-8 items-baseline overflow-hidden"
                    >
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background: `linear-gradient(90deg, ${accent.from}22 0%, transparent 60%)`,
                        }}
                      />

                      <span className="relative md:col-span-1 font-mono text-xs text-white/25 tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>

                      <h3 className="relative md:col-span-5 text-2xl md:text-3xl font-semibold text-white/35 group-hover:text-white transition-colors duration-500">
                        {post.title}
                      </h3>

                      <p className="relative md:col-span-4 text-white/40 text-sm leading-relaxed">
                        {post.dek}
                      </p>

                      <span className="relative md:col-span-2 md:text-right font-mono text-xs text-white/30">
                        {formatBlogDate(post.date)}
                      </span>
                    </Link>
                  </FocusRow>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
