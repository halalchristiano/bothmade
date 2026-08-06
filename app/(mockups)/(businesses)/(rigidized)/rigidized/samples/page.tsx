import Link from 'next/link';
import styles from '../rigidized.module.css';
import { SampleTray } from '../RigidizedUI';

export const metadata = { title: 'Sample tray · Rigidized Metals — concept' };

export default function SamplesPage() {
  return (
    <>
      <div className={styles.wrap}>
        <p className={styles.breadcrumb}>
          <Link href="/rigidized">Home</Link> / Samples
        </p>
      </div>

      <section className={styles.sectionTight}>
        <div className={styles.wrap}>
          <p className={styles.eyebrow}>Sample tray</p>
          <h1 className={styles.h1} style={{ fontSize: 'clamp(2.2rem,5.5vw,3.8rem)' }}>
            One request.<br />All of it.
          </h1>
          <p className={styles.lead}>
            Every finish you added, with the project details attached — so the person who picks this
            up knows what it is for before they reply.
          </p>
        </div>
      </section>

      <div className={styles.wrap} style={{ paddingBottom: '5rem' }}>
        <SampleTray />
      </div>
    </>
  );
}
