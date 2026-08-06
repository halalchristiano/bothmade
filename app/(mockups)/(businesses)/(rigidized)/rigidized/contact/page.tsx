import Link from 'next/link';
import styles from '../rigidized.module.css';

export const metadata = { title: 'Contact · Rigidized Metals — concept' };

export default function ContactPage() {
  return (
    <>
      <div className={styles.wrap}>
        <p className={styles.breadcrumb}>
          <Link href="/rigidized">Home</Link> / Contact
        </p>
      </div>

      <section className={styles.sectionTight} style={{ paddingBottom: '5rem' }}>
        <div className={styles.wrap}>
          <div className={styles.detailHero}>
            <div>
              <p className={styles.eyebrow}>Contact</p>
              <h1 className={styles.h1} style={{ fontSize: 'clamp(2rem,4.6vw,3.2rem)' }}>
                Tell us about the project.
              </h1>
              <p className={styles.body} style={{ marginBottom: '2rem' }}>
                If you already know which patterns you want, the{' '}
                <Link href="/rigidized/samples" style={{ color: 'var(--brass)' }}>sample tray</Link>{' '}
                is faster — it carries your selections with the enquiry.
              </p>

              <dl className={styles.specList}>
                <div className={styles.specRow}>
                  <dt>Telephone</dt>
                  <dd>800.836.2580</dd>
                </div>
                <div className={styles.specRow}>
                  <dt>Address</dt>
                  <dd>658 Ohio St, Buffalo NY 14203</dd>
                </div>
              </dl>
            </div>

            <form>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Name</span>
                  <input className={styles.input} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Company</span>
                  <input className={styles.input} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Email</span>
                  <input type="email" className={styles.input} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Phone</span>
                  <input className={styles.input} />
                </label>
              </div>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>What do you need?</span>
                <select className={styles.select}>
                  <option>Specifying for a project</option>
                  <option>Fabrication enquiry</option>
                  <option>Design assist</option>
                  <option>Something else</option>
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Details</span>
                <textarea className={styles.textarea} />
              </label>

              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ width: '100%', justifyContent: 'center' }}>
                Send
              </button>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '0.9rem' }}>
                Concept only — nothing is submitted anywhere.
              </p>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
