import Link from 'next/link';
import styles from '../rigidized.module.css';

export const metadata = { title: 'Capabilities · Rigidized Metals — concept' };

const CAPABILITIES = [
  {
    id: 'texturing',
    title: 'Deep texturing',
    body: 'The process the company was founded on. Texturing adds strength and impact resistance, hides scratches and handling marks, and lets a lighter gauge do the work of a heavier one — which is where most of the cost saving on a project comes from.',
  },
  {
    id: 'fabrication',
    title: 'Fabrication',
    body: 'Cutting, forming, welding and finishing textured sheet without flattening the pattern at the bend — the part that goes wrong when textured metal is fabricated by someone who does not make it.',
  },
  {
    id: 'design-assist',
    title: 'Design assist',
    body: 'Working with the architect and the fabricator before the drawings are fixed: panel sizes, joint treatment, fixing method, and how the pattern reads at the distance people will actually stand from it.',
  },
  {
    id: 'finishing',
    title: 'Finishing',
    body: 'Highlighting, side highlighting, non-prime highlighting and perforation. The finish is what decides how the texture reads under the light it will actually live under.',
  },
];

export default function CapabilitiesPage() {
  return (
    <>
      <div className={styles.wrap}>
        <p className={styles.breadcrumb}>
          <Link href="/rigidized">Home</Link> / Capabilities
        </p>
      </div>

      <section className={styles.sectionTight}>
        <div className={styles.wrap}>
          <p className={styles.eyebrow}>Capabilities</p>
          <h1 className={styles.h1} style={{ fontSize: 'clamp(2.2rem,5.5vw,3.8rem)' }}>
            We make it,<br />so we can work it.
          </h1>
          <p className={styles.lead}>
            Textured metal behaves differently from the flat sheet it started as. Everything below
            exists because the alternative is discovering that on site.
          </p>
        </div>
      </section>

      <section style={{ paddingBottom: '5rem' }}>
        <div className={styles.wrap}>
          <div className={`${styles.grid} ${styles.grid2}`}>
            {CAPABILITIES.map((c) => (
              <div key={c.id} id={c.id} className={styles.card} style={{ cursor: 'default', padding: '2.25rem 2rem' }}>
                <h2 className={styles.h3}>{c.title}</h2>
                <p className={styles.cardBlurb} style={{ fontSize: '0.92rem' }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
