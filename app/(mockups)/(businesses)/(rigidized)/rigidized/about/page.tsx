import Link from 'next/link';
import styles from '../rigidized.module.css';
import { Swatch } from '../RigidizedUI';
import { patternBySlug } from '../patterns';

export const metadata = { title: 'Since 1940 · Rigidized Metals — concept' };

export default function AboutPage() {
  const original = patternBySlug('5wl')!;

  return (
    <>
      <div className={styles.wrap}>
        <p className={styles.breadcrumb}>
          <Link href="/rigidized">Home</Link> / About
        </p>
      </div>

      <section className={styles.sectionTight}>
        <div className={styles.wrap}>
          <div className={styles.detailHero}>
            <Swatch pattern={original} alloy="stainless" className={styles.detailSwatch} />
            <div>
              <p className={styles.eyebrow}>Buffalo, New York · since 1940</p>
              <h1 className={styles.h1} style={{ fontSize: 'clamp(2rem,4.6vw,3.2rem)' }}>
                It started with a cigarette case.
              </h1>
              <p className={styles.body} style={{ marginBottom: '1.25rem' }}>
                Richard &ldquo;Stainless&rdquo; Smith was a stainless steel salesman for Republic
                Steel. On a trip to New York he saw an embossed cigarette case in Brooks Brothers and
                wondered what would happen if you did that to a sheet of metal — at scale, and deep
                enough to change how the sheet behaved.
              </p>
              <p className={styles.body} style={{ marginBottom: '1.25rem' }}>
                The company he founded in 1940 was called Rigid-tex, and the first pattern it made is
                still in the range. Eighty-odd years and three generations later, the same family
                runs it from the same city.
              </p>
              <p className={styles.body}>
                What the process does has not changed either: texture a sheet deeply enough and it
                gets stronger, hides the scratches a flat sheet would show, and lets a thinner gauge
                do a heavier one&rsquo;s job.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statN}>1940</div>
          <div className={styles.statLabel}>Founded as Rigid-tex</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statN}>3rd</div>
          <div className={styles.statLabel}>Generation, family owned</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statN}>658</div>
          <div className={styles.statLabel}>Ohio Street, Buffalo</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statN}>3</div>
          <div className={styles.statLabel}>Markets: architectural, industrial, transportation</div>
        </div>
      </div>
    </>
  );
}
