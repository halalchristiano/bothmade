import Link from 'next/link';
import { ArrowRight, FileText, Layers, Package } from 'lucide-react';
import styles from './rigidized.module.css';
import { Swatch } from './RigidizedUI';
import { PATTERNS, combinationCount } from './patterns';

export default function RigidizedHome() {
  const hero = PATTERNS.find((p) => p.slug === '6wl') ?? PATTERNS[0];

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className={styles.hero}>
        <Swatch pattern={hero} alloy="brass" className={styles.heroBg} />
        <div className={styles.heroInner}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>Buffalo, New York · since 1940</p>
            <h1 className={styles.h1}>
              Metal that<br />holds the light.
            </h1>
            <p className={styles.lead}>
              Deep-textured stainless, aluminium, brass and bronze. Stronger than the flat sheet it
              came from, lighter than the gauge it replaces, and impossible to photograph properly —
              which is why this site lets you filter it instead.
            </p>
            <div className={styles.heroActions}>
              <Link href="/rigidized/patterns" className={`${styles.btn} ${styles.btnPrimary}`}>
                Open the selector <ArrowRight size={15} />
              </Link>
              <Link href="/rigidized/specifications" className={`${styles.btn} ${styles.btnGhost}`}>
                Specification library
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Marquee of patterns ---------- */}
      <div className={styles.marquee}>
        {PATTERNS.map((p, i) => (
          <Link
            key={p.slug}
            href={`/rigidized/patterns/${p.slug}`}
            className={styles.marqueeItem}
            aria-label={p.name}
          >
            <Swatch
              pattern={p}
              alloy={(['stainless', 'brass', 'aluminum', 'bronze'] as const)[i % 4]}
              className={styles.marqueeSwatch}
            />
            <span className={styles.marqueeLabel}>{p.name}</span>
          </Link>
        ))}
      </div>

      {/* ---------- The argument ---------- */}
      <section className={styles.section}>
        <div className={styles.wrap}>
          <div className={styles.detailHero}>
            <div>
              <p className={styles.eyebrow}>The problem this site solves</p>
              <h2 className={styles.h2}>
                You are not reading a catalogue.<br />You are narrowing one.
              </h2>
            </div>
            <div>
              <p className={styles.body} style={{ marginBottom: '1.25rem' }}>
                A pattern, an alloy, a finish, an application, a gauge. Each choice narrows the next,
                and the combination you land on is the one thing you actually need to specify.
              </p>
              <p className={styles.body} style={{ marginBottom: '1.25rem' }}>
                Every catalogue website in this industry asks you to hold that in your head while you
                open one page at a time. This one does the narrowing for you, keeps the documents
                attached to the result, and lets you put two finishes next to each other before you
                commit a project to one.
              </p>
              <Link href="/rigidized/patterns" className={`${styles.btn} ${styles.btnGhost}`}>
                Try it <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statN}>1940</div>
          <div className={styles.statLabel}>Texturing metal since</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statN}>25+</div>
          <div className={styles.statLabel}>Deep-textured patterns</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statN}>15+</div>
          <div className={styles.statLabel}>Micro textures &amp; finishes</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statN}>3</div>
          <div className={styles.statLabel}>Generations, family owned</div>
        </div>
      </div>

      {/* ---------- Three things ---------- */}
      <section className={styles.section}>
        <div className={styles.wrap}>
          <div className={`${styles.grid} ${styles.grid3}`}>
            <div className={styles.card} style={{ cursor: 'default', padding: '2rem 1.75rem' }}>
              <Layers size={20} style={{ color: 'var(--brass)', marginBottom: '1rem' }} />
              <h3 className={styles.h3}>Filter, then compare</h3>
              <p className={styles.cardBlurb}>
                Narrow {PATTERNS.length} patterns and {combinationCount()} finish combinations down to
                the handful that suit your substrate, exposure and budget — then look at three of them
                together.
              </p>
            </div>
            <div className={styles.card} style={{ cursor: 'default', padding: '2rem 1.75rem' }}>
              <FileText size={20} style={{ color: 'var(--brass)', marginBottom: '1rem' }} />
              <h3 className={styles.h3}>Documents where the product is</h3>
              <p className={styles.cardBlurb}>
                Three-part CSI MasterSpec, data sheet, LEED documentation and CAD profile, on the same
                page as the pattern they describe. Not five separate download pages.
              </p>
            </div>
            <div className={styles.card} style={{ cursor: 'default', padding: '2rem 1.75rem' }}>
              <Package size={20} style={{ color: 'var(--brass)', marginBottom: '1rem' }} />
              <h3 className={styles.h3}>One sample request</h3>
              <p className={styles.cardBlurb}>
                Add finishes to a tray as you go and send one request carrying the project name, the
                stage and the area — so whoever picks it up already knows what it is for.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Specifier callout ---------- */}
      <section className={styles.sectionTight}>
        <div className={styles.wrap}>
          <div className={styles.callout}>
            <p className={styles.eyebrow}>For architects and specifiers</p>
            <h2 className={styles.h2} style={{ fontSize: 'clamp(1.5rem,3.2vw,2.2rem)' }}>
              Everything a submittal needs, in one download.
            </h2>
            <p className={styles.body} style={{ marginBottom: '1.75rem' }}>
              Pick your patterns, pick your alloys, and take the whole package at once — three-part
              specifications in CSI MasterSpec format, data sheets, LEED documentation and CAD
              profiles.
            </p>
            <Link href="/rigidized/specifications" className={`${styles.btn} ${styles.btnPrimary}`}>
              Open the library <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
