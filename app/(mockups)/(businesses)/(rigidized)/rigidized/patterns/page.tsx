import Link from 'next/link';
import styles from '../rigidized.module.css';
import { PatternSelector } from '../PatternSelector';
import { PATTERNS, combinationCount } from '../patterns';

export const metadata = { title: 'Patterns · Rigidized Metals — concept' };

export default function PatternsPage() {
  return (
    <>
      <div className={styles.wrap}>
        <p className={styles.breadcrumb}>
          <Link href="/rigidized">Home</Link> / Patterns
        </p>
      </div>

      <section className={styles.sectionTight}>
        <div className={styles.wrap}>
          <p className={styles.eyebrow}>Select</p>
          <h1 className={styles.h1} style={{ fontSize: 'clamp(2.2rem,5.5vw,3.8rem)' }}>
            Find the surface,<br />not the page.
          </h1>
          <p className={styles.lead}>
            Filter by alloy, finish and application. Compare up to three side by side. Everything you
            need to specify — the data sheet, the three-part spec, the LEED documentation and a
            sample — collected in one place instead of five.
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)', maxWidth: '60ch' }}>
            Concept note: {PATTERNS.length} patterns shown, giving {combinationCount()} alloy and
            finish combinations. The real catalogue runs to 25+ patterns and 15+ micro finishes —
            the full set would be imported during the build.
          </p>
        </div>
      </section>

      <div className={styles.wrap} style={{ paddingBottom: '5rem' }}>
        <PatternSelector />
      </div>
    </>
  );
}
