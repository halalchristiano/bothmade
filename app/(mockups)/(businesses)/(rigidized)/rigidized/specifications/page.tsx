import Link from 'next/link';
import { FileText } from 'lucide-react';
import styles from '../rigidized.module.css';
import { Swatch } from '../RigidizedUI';
import { PATTERNS, documentsFor } from '../patterns';

export const metadata = { title: 'Specification library · Rigidized Metals — concept' };

export default function SpecificationsPage() {
  const total = PATTERNS.reduce((n, p) => n + documentsFor(p).length, 0);

  return (
    <>
      <div className={styles.wrap}>
        <p className={styles.breadcrumb}>
          <Link href="/rigidized">Home</Link> / Specifications
        </p>
      </div>

      <section className={styles.sectionTight}>
        <div className={styles.wrap}>
          <p className={styles.eyebrow}>Specification library</p>
          <h1 className={styles.h1} style={{ fontSize: 'clamp(2.2rem,5.5vw,3.8rem)' }}>
            One library.<br />Not one page per file.
          </h1>
          <p className={styles.lead}>
            {total} documents across {PATTERNS.length} patterns — three-part specifications in CSI
            MasterSpec format, data sheets, LEED documentation and CAD profiles. Grouped by the
            pattern they belong to, and downloadable together.
          </p>
        </div>
      </section>

      <section style={{ paddingBottom: '5rem' }}>
        <div className={styles.wrap}>
          {PATTERNS.map((pattern) => (
            <div key={pattern.slug} style={{ marginBottom: '3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <Swatch pattern={pattern} alloy={pattern.alloys[0]} className={styles.trayThumb} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 className={styles.h3} style={{ margin: 0 }}>
                    <Link href={`/rigidized/patterns/${pattern.slug}`}>{pattern.name}</Link>
                  </h2>
                  <p className={styles.cardMeta} style={{ marginTop: '0.3rem' }}>
                    {documentsFor(pattern).length} documents
                  </p>
                </div>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem' }}>
                  Download all
                </button>
              </div>
              <div>
                {documentsFor(pattern).map((doc) => (
                  <div key={doc.label} className={styles.docRow}>
                    <FileText size={15} className={styles.docIcon} />
                    <span className={styles.docName}>{doc.label}</span>
                    <span className={styles.docFormat}>{doc.format}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
