'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Package, X } from 'lucide-react';
import styles from './rigidized.module.css';
import { ALLOY_CLASS, textureStyle } from './textures';
import {
  ALLOYS,
  FINISHES,
  PATTERNS,
  alloyLabel,
  finishLabel,
  patternBySlug,
  type AlloyKey,
  type FinishKey,
  type Pattern,
} from './patterns';

/* ------------------------------------------------------------------ *
 * The swatch
 * ------------------------------------------------------------------ */

export function Swatch({
  pattern,
  alloy = 'stainless',
  className = '',
}: {
  pattern: Pattern;
  alloy?: AlloyKey;
  className?: string;
}) {
  return (
    <div
      className={`${styles.swatch} ${styles[ALLOY_CLASS[alloy]]} ${className}`}
      style={textureStyle(pattern.texture, pattern.depth)}
      role="img"
      aria-label={`${pattern.name} in ${alloyLabel(alloy)}`}
    />
  );
}

/* ------------------------------------------------------------------ *
 * The sample tray
 *
 * The one piece of state that crosses every page. It is the whole argument
 * of the concept in miniature: choose a pattern, an alloy and a finish
 * anywhere on the site, and it accumulates into one request rather than
 * five separate enquiries.
 * ------------------------------------------------------------------ */

export interface TrayItem {
  id: string;
  slug: string;
  alloy: AlloyKey;
  finish: FinishKey;
}

interface TrayApi {
  items: TrayItem[];
  add: (slug: string, alloy: AlloyKey, finish: FinishKey) => void;
  remove: (id: string) => void;
  clear: () => void;
  has: (slug: string, alloy: AlloyKey, finish: FinishKey) => boolean;
}

const TrayContext = createContext<TrayApi | null>(null);
const STORAGE_KEY = 'rigidized-concept-tray';

export function useTray(): TrayApi {
  const ctx = useContext(TrayContext);
  if (!ctx) throw new Error('useTray outside the shell');
  return ctx;
}

function trayId(slug: string, alloy: AlloyKey, finish: FinishKey) {
  return `${slug}::${alloy}::${finish}`;
}

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

const NAV = [
  { href: '/rigidized/patterns', label: 'Patterns' },
  { href: '/rigidized/specifications', label: 'Specifications' },
  { href: '/rigidized/capabilities', label: 'Capabilities' },
  { href: '/rigidized/about', label: 'About' },
  { href: '/rigidized/contact', label: 'Contact' },
];

export function RigidizedShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [items, setItems] = useState<TrayItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  // Restored on load so the tray survives a page change — the point of a
  // basket is that it is still there when you come back to it.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* a concept should never fail over a storage quirk */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const add = useCallback((slug: string, alloy: AlloyKey, finish: FinishKey) => {
    setItems((prev) => {
      const id = trayId(slug, alloy, finish);
      return prev.some((i) => i.id === id) ? prev : [...prev, { id, slug, alloy, finish }];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const has = useCallback(
    (slug: string, alloy: AlloyKey, finish: FinishKey) =>
      items.some((i) => i.id === trayId(slug, alloy, finish)),
    [items]
  );

  const api = useMemo(() => ({ items, add, remove, clear, has }), [items, add, remove, clear, has]);

  return (
    <TrayContext.Provider value={api}>
      <div className={styles.root}>
        <div className={styles.conceptBar}>
          <span>
            <strong>Concept</strong> — an unsolicited design study by Bothmade. Not affiliated with,
            endorsed by, or produced for Rigidized&nbsp;Metals Corporation.
          </span>
        </div>

        <header className={styles.nav}>
          <div className={styles.navInner}>
            <Link href="/rigidized" className={styles.wordmark}>
              RIGIDIZED<span>®</span>
              <span className={styles.wordmarkSub}>Metals · since 1940</span>
            </Link>

            <nav className={styles.navLinks}>
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${
                    pathname.startsWith(item.href) ? styles.navLinkActive : ''
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className={styles.navTray}>
              <Link href="/rigidized/samples" className={styles.trayButton}>
                <Package size={15} />
                Samples
                {items.length > 0 && <span className={styles.trayCount}>{items.length}</span>}
              </Link>
              <button
                type="button"
                className={styles.menuButton}
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label="Menu"
              >
                {menuOpen ? <X size={17} /> : <Menu size={17} />}
              </button>
            </div>
          </div>

          {menuOpen && (
            <div className={styles.mobileMenu}>
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </header>

        {children}

        <footer className={styles.footer}>
          <div className={styles.wrap}>
            <div className={styles.footerGrid}>
              <div>
                <p className={styles.footerTitle}>Product</p>
                <ul className={styles.footerList}>
                  <li><Link href="/rigidized/patterns">All patterns</Link></li>
                  <li><Link href="/rigidized/patterns?alloy=brass">Brass &amp; bronze</Link></li>
                  <li><Link href="/rigidized/specifications">Specification library</Link></li>
                  <li><Link href="/rigidized/samples">Sample tray</Link></li>
                </ul>
              </div>
              <div>
                <p className={styles.footerTitle}>Capability</p>
                <ul className={styles.footerList}>
                  <li><Link href="/rigidized/capabilities">Fabrication</Link></li>
                  <li><Link href="/rigidized/capabilities#design-assist">Design assist</Link></li>
                  <li><Link href="/rigidized/capabilities#finishing">Finishing</Link></li>
                </ul>
              </div>
              <div>
                <p className={styles.footerTitle}>Company</p>
                <ul className={styles.footerList}>
                  <li><Link href="/rigidized/about">Since 1940</Link></li>
                  <li><Link href="/rigidized/contact">Contact</Link></li>
                </ul>
              </div>
              <div>
                <p className={styles.footerTitle}>Buffalo, New York</p>
                <p style={{ fontSize: '0.87rem', color: 'var(--text-soft)', lineHeight: 1.7, margin: 0 }}>
                  658 Ohio Street<br />
                  Buffalo, NY 14203<br />
                  <span style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: '0.82rem' }}>
                    800.836.2580
                  </span>
                </p>
              </div>
            </div>

            <div className={styles.footerBase}>
              <span>
                Design concept by <a href="https://bothmade.studio" style={{ color: 'var(--brass)' }}>Bothmade</a>.
                Pattern names and specifications are the property of Rigidized Metals Corporation.
              </span>
              <span>Not a live commercial site. Nothing here can be ordered.</span>
            </div>
          </div>
        </footer>
      </div>
    </TrayContext.Provider>
  );
}

/* ------------------------------------------------------------------ *
 * Add-to-tray control, used on the selector and the detail page
 * ------------------------------------------------------------------ */

export function AddSample({
  pattern,
  alloy,
  finish,
  compact = false,
}: {
  pattern: Pattern;
  alloy: AlloyKey;
  finish: FinishKey;
  compact?: boolean;
}) {
  const tray = useTray();
  const inTray = tray.has(pattern.slug, alloy, finish);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (inTray) {
          tray.remove(`${pattern.slug}::${alloy}::${finish}`);
        } else {
          tray.add(pattern.slug, alloy, finish);
        }
      }}
      className={`${styles.btn} ${inTray ? styles.btnGhost : styles.btnPrimary}`}
      style={compact ? { padding: '0.55rem 0.9rem', fontSize: '0.82rem' } : undefined}
    >
      {inTray ? 'In your tray' : 'Add sample'}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The tray page body — needs client state, so it lives here
 * ------------------------------------------------------------------ */

export function SampleTray() {
  const tray = useTray();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className={styles.callout}>
        <h2 className={styles.h2}>Request received</h2>
        <p className={styles.body}>
          In the real thing this is where the request would land with the right regional
          representative, carrying every pattern, alloy and finish you chose, plus the project
          details — instead of arriving as an email that says &ldquo;can you send me some
          samples&rdquo;.
        </p>
        <p style={{ marginTop: '1.5rem' }}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => { tray.clear(); setSent(false); }}>
            Start again
          </button>
        </p>
      </div>
    );
  }

  if (tray.items.length === 0) {
    return (
      <div className={styles.empty}>
        <p style={{ margin: '0 0 1.25rem' }}>Your sample tray is empty.</p>
        <Link href="/rigidized/patterns" className={`${styles.btn} ${styles.btnPrimary}`}>
          Browse the patterns
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.selectorLayout}>
      <div>
        <div style={{ borderTop: '1px solid var(--line)' }}>
          {tray.items.map((item) => {
            const pattern = patternBySlug(item.slug);
            if (!pattern) return null;
            return (
              <div key={item.id} className={styles.trayItem}>
                <Swatch pattern={pattern} alloy={item.alloy} className={styles.trayThumb} />
                <div className={styles.trayInfo}>
                  <div className={styles.trayName}>{pattern.name}</div>
                  <div className={styles.traySpec}>
                    {alloyLabel(item.alloy)} · {finishLabel(item.finish)}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.trayRemove}
                  onClick={() => tray.remove(item.id)}
                  aria-label={`Remove ${pattern.name}`}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <p style={{ marginTop: '1.25rem', fontSize: '0.83rem', color: 'var(--text-faint)' }}>
          {tray.items.length} {tray.items.length === 1 ? 'sample' : 'samples'} ·{' '}
          <button type="button" className={styles.clearBtn} onClick={tray.clear}>
            clear the tray
          </button>
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
      >
        <h2 className={styles.h3}>Where is this going?</h2>
        <p style={{ fontSize: '0.87rem', color: 'var(--text-soft)', marginBottom: '1.5rem' }}>
          The project details travel with the samples, so whoever picks this up already knows what
          it is for.
        </p>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input className={styles.input} required />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Practice or company</span>
            <input className={styles.input} required />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <input type="email" className={styles.input} required />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Phone</span>
            <input className={styles.input} />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Project name</span>
          <input className={styles.input} placeholder="e.g. Delaware North lobby" />
        </label>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Stage</span>
            <select className={styles.select}>
              <option>Concept</option>
              <option>Design development</option>
              <option>Construction documents</option>
              <option>Bidding</option>
              <option>Under construction</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Approximate area</span>
            <input className={styles.input} placeholder="sq ft" />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Anything else worth knowing</span>
          <textarea className={styles.textarea} placeholder="Substrate, fixing method, exterior exposure, lead time…" />
        </label>

        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} style={{ width: '100%', justifyContent: 'center' }}>
          Request {tray.items.length} {tray.items.length === 1 ? 'sample' : 'samples'}
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.9rem' }}>
          Concept only — nothing is submitted anywhere.
        </p>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pattern detail configurator — alloy and finish, live
 * ------------------------------------------------------------------ */

export function PatternConfigurator({ pattern }: { pattern: Pattern }) {
  const [alloy, setAlloy] = useState<AlloyKey>(pattern.alloys[0]);
  const [finish, setFinish] = useState<FinishKey>(pattern.finishes[0]);

  const gauge = ALLOYS.find((a) => a.key === alloy)?.gauge ?? '';

  return (
    <div className={styles.detailHero}>
      <Swatch pattern={pattern} alloy={alloy} className={styles.detailSwatch} />

      <div>
        <p className={styles.eyebrow}>
          {pattern.since ? `Introduced ${pattern.since}` : 'Pattern'}
        </p>
        <h1 className={styles.h1} style={{ fontSize: 'clamp(2.2rem,5vw,3.4rem)' }}>
          {pattern.name}
        </h1>
        <p className={styles.lead}>{pattern.blurb}</p>

        <div className={styles.filterGroup}>
          <p className={styles.filterTitle}>Alloy</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {pattern.alloys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setAlloy(key)}
                className={`${styles.btn} ${alloy === key ? styles.btnPrimary : styles.btnGhost}`}
                style={{ padding: '0.5rem 0.9rem', fontSize: '0.82rem' }}
              >
                {alloyLabel(key)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <p className={styles.filterTitle}>Finish</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {pattern.finishes.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFinish(key)}
                className={`${styles.btn} ${finish === key ? styles.btnPrimary : styles.btnGhost}`}
                style={{ padding: '0.5rem 0.9rem', fontSize: '0.82rem' }}
              >
                {finishLabel(key)}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)', marginTop: '0.75rem' }}>
            {FINISHES.find((f) => f.key === finish)?.note}
          </p>
        </div>

        <dl className={styles.specList} style={{ marginTop: '1.5rem' }}>
          <div className={styles.specRow}>
            <dt>Gauge range</dt>
            <dd>{gauge}</dd>
          </div>
          <div className={styles.specRow}>
            <dt>Sheet widths</dt>
            <dd>36″ · 48″ · 60″</dd>
          </div>
          <div className={styles.specRow}>
            <dt>Sheet lengths</dt>
            <dd>96″ · 120″ · 144″</dd>
          </div>
          <div className={styles.specRow}>
            <dt>Relative depth</dt>
            <dd>{'▮'.repeat(pattern.depth)}{'▯'.repeat(5 - pattern.depth)}</dd>
          </div>
        </dl>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
          <AddSample pattern={pattern} alloy={alloy} finish={finish} />
          <Link href="/rigidized/specifications" className={`${styles.btn} ${styles.btnGhost}`}>
            Specification documents
          </Link>
        </div>
      </div>
    </div>
  );
}

/* Re-exported so pages can render a pattern grid without importing the list. */
export { PATTERNS };
