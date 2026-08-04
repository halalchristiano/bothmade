'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, ReactNode, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Menu,
  Phone,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import styles from './brandon.module.css';

const navItems = [
  { href: '/brandon-roofing', label: 'Home' },
  { href: '/brandon-roofing/services', label: 'Services' },
  { href: '/brandon-roofing#work', label: 'Our work' },
  { href: '/brandon-roofing#story', label: 'About' },
];

export function BrandonShell({ children }: { children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null);

  function moveGlow(event: React.PointerEvent<HTMLDivElement>) {
    shellRef.current?.style.setProperty('--pointer-x', `${event.clientX}px`);
    shellRef.current?.style.setProperty('--pointer-y', `${event.clientY}px`);
  }

  return (
    <div ref={shellRef} onPointerMove={moveGlow} className={`br-site ${styles.site}`}>
      <div className={styles.pointerGlow} aria-hidden="true" />
      <Header />
      {children}
      <Footer />
    </div>
  );
}

function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <Link href="/brandon-roofing" className={styles.wordmark} onClick={() => setOpen(false)}>
        <span>BRANDON</span>
        <span>ROOFING</span>
        <small>Morris County, NJ · Since 1990</small>
      </Link>

      <nav className={`${styles.nav} ${open ? styles.navOpen : ''}`} aria-label="Brandon Roofing navigation">
        {navItems.map((item) => {
          const active = item.href === '/brandon-roofing/services'
            ? pathname === item.href
            : item.href === '/brandon-roofing' && pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={active ? styles.activeNav : ''} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          );
        })}
        <Link href="/brandon-roofing/emergency" className={styles.emergencyLink} onClick={() => setOpen(false)}>
          <span className={styles.liveDot} /> Emergency
        </Link>
      </nav>

      <a href="tel:9735847717" className={styles.headerCall}>
        <Phone size={15} />
        <span>973-584-7717</span>
      </a>

      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
    </header>
  );
}

export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.75, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function ArrowLink({ href, children, light = false }: { href: string; children: ReactNode; light?: boolean }) {
  return (
    <Link href={href} className={`${styles.arrowLink} ${light ? styles.arrowLinkLight : ''}`}>
      <span>{children}</span>
      <ArrowUpRight size={18} />
    </Link>
  );
}

export function TrustRail({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`${styles.trustRail} ${dark ? styles.trustRailDark : ''}`}>
      <span><Star size={16} fill="currentColor" /> 5.0 stars · 52 reviews</span>
      <span><ShieldCheck size={17} /> Licensed & insured</span>
      <span><Clock3 size={17} /> 24/7 response</span>
      <span className={styles.trustTown}>Landing, New Jersey</span>
    </div>
  );
}

export function RoofLayers() {
  const layers = [
    { number: '01', name: 'Architectural shingle', text: 'The weather-facing finish. Selected for the home, climate, and warranty.' },
    { number: '02', name: 'Waterproof underlayment', text: 'A continuous defense layer around valleys, penetrations, and vulnerable edges.' },
    { number: '03', name: 'Ventilated roof deck', text: 'The structure beneath it all—inspected, repaired where needed, and allowed to breathe.' },
  ];

  return (
    <div className={styles.layerStack}>
      {layers.map((layer, index) => (
        <motion.article
          key={layer.number}
          className={styles.layerCard}
          initial={{ opacity: 0, x: 70, y: index * -22 }}
          whileInView={{ opacity: 1, x: 0, y: 0 }}
          viewport={{ once: true, margin: '-15% 0px' }}
          transition={{ duration: 0.75, delay: index * 0.12 }}
          whileHover={{ x: -12 }}
        >
          <span>{layer.number}</span>
          <div>
            <h3>{layer.name}</h3>
            <p>{layer.text}</p>
          </div>
        </motion.article>
      ))}
    </div>
  );
}

export function EstimatePanel({ compact = false }: { compact?: boolean }) {
  const [sent, setSent] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <section id="estimate" className={`${styles.estimate} ${compact ? styles.estimateCompact : ''}`}>
      <div>
        <span className={styles.eyebrow}>A straightforward first step</span>
        <h2>{compact ? 'Tell us what happened.' : 'Let’s look at your roof.'}</h2>
        <p>No pressure. No sales hand-off. Your request goes directly to the local team.</p>
        <a href="tel:9735847717" className={styles.bigPhone}><Phone size={20} /> 973-584-7717</a>
      </div>
      <form onSubmit={submit} className={styles.estimateForm}>
        <label>
          <span>Your name</span>
          <input name="name" autoComplete="name" placeholder="Jane Smith" required />
        </label>
        <label>
          <span>Phone number</span>
          <input name="phone" type="tel" autoComplete="tel" placeholder="(973) 000-0000" required />
        </label>
        <label className={styles.fullField}>
          <span>What can we help with?</span>
          <textarea name="message" rows={3} placeholder="A leak, replacement, inspection…" required />
        </label>
        <button type="submit" className={styles.submitButton}>
          {sent ? <><Check size={18} /> Preview request received</> : <>Request my free estimate <ArrowRight size={18} /></>}
        </button>
        <small>This is a design preview. The form does not send information.</small>
      </form>
    </section>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerLead}>
        <p>A roof should be the last thing<br />you have to worry about.</p>
        <a href="tel:9735847717">Call Brandon <ArrowUpRight size={20} /></a>
      </div>
      <div className={styles.footerGrid}>
        <div className={styles.footerBrand}>
          <strong>BRANDON<br />ROOFING</strong>
          <span>Local since 1990.</span>
        </div>
        <div>
          <span className={styles.footerLabel}>Visit</span>
          <p>175 Landing Rd<br />Landing, NJ 07850</p>
        </div>
        <div>
          <span className={styles.footerLabel}>Contact</span>
          <a href="tel:9735847717">973-584-7717</a>
          <a href="mailto:info@brandon-roofing.com">info@brandon-roofing.com</a>
        </div>
        <div>
          <span className={styles.footerLabel}>Explore</span>
          <Link href="/brandon-roofing/services">Services</Link>
          <Link href="/brandon-roofing/emergency">Emergency repair</Link>
        </div>
      </div>
      <div className={styles.footerBottom}>
        <span>© 2026 Brandon Roofing</span>
        <span>UI concept · Local preview only</span>
      </div>
    </footer>
  );
}
