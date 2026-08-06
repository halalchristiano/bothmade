import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText } from 'lucide-react';
import styles from '../../rigidized.module.css';
import { PatternConfigurator, Swatch } from '../../RigidizedUI';
import { PATTERNS, documentsFor, patternBySlug } from '../../patterns';

export function generateStaticParams() {
  return PATTERNS.map((p) => ({ slug: p.slug }));
}

export default async function PatternPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pattern = patternBySlug(slug);
  if (!pattern) notFound();

  const docs = documentsFor(pattern);
  const related = PATTERNS.filter((p) => p.slug !== pattern.slug).slice(0, 4);

  return (
    <>
      <div className={styles.wrap}>
        <p className={styles.breadcrumb}>
          <Link href="/rigidized">Home</Link> / <Link href="/rigidized/patterns">Patterns</Link> /{' '}
          {pattern.name}
        </p>
      </div>

      <section className={styles.sectionTight}>
        <div className={styles.wrap}>
          <PatternConfigurator pattern={pattern} />
        </div>
      </section>

      <section className={styles.section} style={{ borderTop: '1px solid var(--line)' }}>
        <div className={styles.wrap}>
          <p className={styles.eyebrow}>Everything in one place</p>
          <h2 className={styles.h2}>Specification documents</h2>
          <p className={styles.lead}>
            Every document for {pattern.name}, on the page for {pattern.name}. No separate download
            pages to find one at a time.
          </p>
          <div style={{ maxWidth: '760px' }}>
            {docs.map((doc) => (
              <div key={doc.label} className={styles.docRow}>
                <FileText size={16} className={styles.docIcon} />
                <span className={styles.docName}>{doc.label}</span>
                <span className={styles.docFormat}>{doc.format}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} style={{ borderTop: '1px solid var(--line)' }}>
        <div className={styles.wrap}>
          <h2 className={styles.h2}>Other patterns</h2>
          <div className={`${styles.grid} ${styles.grid4}`} style={{ marginTop: '1.75rem' }}>
            {related.map((p) => (
              <Link key={p.slug} href={`/rigidized/patterns/${p.slug}`} className={styles.card}>
                <Swatch pattern={p} alloy={p.alloys[0]} className={styles.cardSwatch} />
                <div className={styles.cardBody}>
                  <span className={styles.cardName}>{p.name}</span>
                  <div className={styles.cardMeta}>{p.alloys.length} alloys</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
