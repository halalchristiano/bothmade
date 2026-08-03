'use client';

import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [
  { label: 'Web', href: '/web' },
  { label: 'iOS', href: '/ios' },
  { label: 'Vision Pro', href: '/visionpro' },
  { label: 'Work', href: '/work' },
  { label: 'About', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'Pricing', href: '/start' },
  { label: 'Contact', href: '/#contact' },
];

export function Nav() {
  const { scrollY } = useScroll();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolled(latest > 40);
  });

  // "/#contact" is a place on the homepage, not a page — never mark it current.
  const isCurrent = (href: string) => !href.includes('#') && pathname === href;

  // An open menu owns the screen: the page behind it must not scroll, and
  // Escape must close it — both standard overlay contracts.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Route changes close the menu — tapping a link should never leave the
  // overlay hanging over the next page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <motion.nav
        className={`fixed top-0 w-full z-50 border-b transition-all duration-500 ${
          scrolled
            ? 'backdrop-blur-xl bg-black/70 border-white/10 py-3'
            : 'backdrop-blur-md bg-black/20 border-transparent py-5'
        }`}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <Link href="/" onClick={() => setOpen(false)} aria-label="Bothmade home">
            <motion.span
              className="text-2xl font-bold tracking-tight inline-block"
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              {/* The mark carries the brand's split: wireframe web, solid native. */}
              <span
                aria-hidden="true"
                className="text-transparent"
                style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}
              >
                both
              </span>
              <span aria-hidden="true">made</span>
            </motion.span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {LINKS.map((link) => {
              const current = isCurrent(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className={`text-sm transition relative group py-1 ${
                    current ? 'text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {link.label}
                  <span
                    className={`absolute bottom-0 left-0 h-px bg-gradient-to-r from-sky-400 to-purple-500 transition-all duration-300 ${
                      current ? 'w-full' : 'w-0 group-hover:w-full'
                    }`}
                  />
                </Link>
              );
            })}
            {/* The one pill in the nav belongs to new business, not to
                people who have already paid. */}
            <Link
              href="/client/login"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Client Login
            </Link>
            <Link
              href="/start"
              className="text-sm font-medium rounded-full bg-white text-black px-4 py-1.5 hover:bg-white/85 transition-colors"
            >
              Start a project
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            /* 44px box, not 32 — the visual bars stay the same size, the
               tap target just stops being smaller than a fingertip. */
            className="md:hidden relative -mr-2.5 w-11 h-11 flex flex-col items-center justify-center gap-1.5 z-50"
          >
            <motion.span
              className="block w-6 h-px bg-white origin-center"
              animate={open ? { rotate: 45, y: 3.5 } : { rotate: 0, y: 0 }}
              transition={{ duration: 0.3 }}
            />
            <motion.span
              className="block w-6 h-px bg-white origin-center"
              animate={open ? { rotate: -45, y: -3.5 } : { rotate: 0, y: 0 }}
              transition={{ duration: 0.3 }}
            />
          </button>
        </div>
      </motion.nav>

      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            /* Nine rows at text-4xl overflow a short phone. The centring
               lives on the child's my-auto, not justify-center here — a
               centred flex parent makes overflow above the fold
               unscrollable, which is how the top link went missing. */
            className="fixed inset-0 z-40 bg-[#05030a]/98 backdrop-blur-2xl md:hidden flex flex-col overflow-y-auto overscroll-contain px-8 pt-24 pb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="my-auto w-full shrink-0 space-y-1">
              {LINKS.map((link, idx) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ delay: idx * 0.07, duration: 0.3 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={isCurrent(link.href) ? 'page' : undefined}
                    className={`block text-3xl sm:text-4xl font-bold py-2.5 transition-colors ${
                      isCurrent(link.href)
                        ? 'text-white'
                        : 'text-gray-300 hover:text-sky-300'
                    }`}
                  >
                    {link.label}
                    {isCurrent(link.href) && (
                      <span className="ml-4 align-middle inline-block w-2 h-2 rounded-full bg-gradient-to-r from-sky-400 to-purple-500" />
                    )}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ delay: LINKS.length * 0.07, duration: 0.3 }}
              >
                <Link
                  href="/start"
                  onClick={() => setOpen(false)}
                  className="block text-3xl sm:text-4xl font-bold py-2.5 bg-gradient-to-r from-sky-300 to-purple-400 bg-clip-text text-transparent"
                >
                  Start a project
                </Link>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ delay: (LINKS.length + 1) * 0.07, duration: 0.3 }}
              >
                <Link
                  href="/client/login"
                  onClick={() => setOpen(false)}
                  className="block text-lg py-3 text-gray-400 hover:text-white transition-colors"
                >
                  Client Login
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
