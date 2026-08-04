'use client';

import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { Wordmark } from '@/components/Wordmark';
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

/**
 * A menu row, sized against the viewport rather than a breakpoint.
 *
 * The menu has ten rows and they all have to be on screen at once: an
 * iPhone 13 is 454pt shorter than a 17 Pro Max, and a fixed text-3xl fits
 * the second comfortably while pushing "Work" up behind the wordmark on the
 * first. Width breakpoints cannot see that, because the constraint is
 * height — the two phones are only 50pt apart across.
 *
 * svh rather than vh: vh on iOS is the height with the browser chrome
 * *retracted*, so a menu measured in vh is too tall the whole time the URL
 * bar is showing, which is most of the time. The clamp floor keeps it
 * legible on the shortest phones; the ceiling stops it ballooning on a
 * tablet held in portrait.
 */
const MENU_ROW = {
  fontSize: 'clamp(1.1875rem, 3.3svh, 2.125rem)',
  paddingBlock: 'clamp(0.2rem, 0.75svh, 0.625rem)',
} as const;

/** The quieter last row, on the same principle at a smaller scale. */
const MENU_FOOTER_ROW = {
  fontSize: 'clamp(0.875rem, 1.8svh, 1.125rem)',
  paddingBlock: 'clamp(0.25rem, 1svh, 0.75rem)',
} as const;

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
              className="inline-block"
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 400 }}
              aria-hidden="true"
            >
              <Wordmark />
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
            /* Ten rows have to fit a phone, so they are sized against the
               viewport's height rather than a fixed step (see MENU_ROW) —
               scrolling a navigation menu is a failure state, not a feature.
               `safe center` is the belt to that braces: if the content ever
               does overflow, centring silently hides the first row behind
               the wordmark bar and auto margins make it unreachable, so
               alignment falls back to the top instead. */
            className="fixed inset-0 z-40 bg-[#05030a]/98 backdrop-blur-2xl md:hidden flex flex-col [justify-content:safe_center] overflow-y-auto overscroll-contain px-8 pt-24 pb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="w-full shrink-0 space-y-1">
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
                    style={MENU_ROW}
                    className={`block font-bold transition-colors ${
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
                  style={MENU_ROW}
                  className="block font-bold bg-gradient-to-r from-sky-300 to-purple-400 bg-clip-text text-transparent"
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
                  style={MENU_FOOTER_ROW}
                  className="block text-gray-400 hover:text-white transition-colors"
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
