import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clock3, Phone } from 'lucide-react';
import { EstimatePanel, Reveal, TrustRail } from '../BrandonUI';
import styles from '../brandon.module.css';

export default function EmergencyPage() {
  return (
    <main>
      <section className={styles.emergencyHero}>
        <Image className={styles.emergencyHeroImage} src="/brandon/commercial.jpg" alt="Property during severe New Jersey winter weather" fill priority sizes="100vw" />
        <div className={styles.rain} aria-hidden="true" />
        <div className={styles.emergencyHeroContent}>
          <Reveal>
            <span className={styles.eyebrow} style={{ color: '#ff8377' }}>Storm damage · Active leaks · Fallen limbs</span>
            <h1>Your roof can’t wait until morning.</h1>
            <p>Call the local roofer who answers. We provide 24-hour emergency response across Morris and Sussex County.</p>
            <div className={styles.heroActions}>
              <a href="tel:9735847717" className={styles.primaryButton}>Call 973-584-7717 <Phone size={18} /></a>
              <Link href="#estimate" className={styles.secondaryButton} style={{ borderColor: 'white' }}>Send the details <ArrowRight size={18} /></Link>
            </div>
          </Reveal>
          <Reveal className={styles.emergencyCard} delay={0.12}>
            <span><Clock3 size={16} /> Emergency line open</span>
            <strong>Crews available.<br />Help starts now.</strong>
            <p>Describe the leak or damage and we’ll tell you the safest next step.</p>
            <a href="tel:9735847717"><Phone size={18} /> 973-584-7717</a>
          </Reveal>
        </div>
      </section>
      <TrustRail dark />

      <section className={styles.emergencySteps}>
        <div className={styles.emergencyStepsInner}>
          <Reveal>
            <span className={styles.sectionIndex}>What to do right now</span>
            <h2>Stay safe.<br />Limit the damage.</h2>
          </Reveal>
          <div className={styles.steps}>
            <Reveal className={styles.step}><div><h3>Move away from active water</h3><p>Keep people, pets, and electronics clear. Do not climb onto a wet or storm-damaged roof.</p></div></Reveal>
            <Reveal className={styles.step}><div><h3>Contain what you safely can</h3><p>Place a container beneath drips and move belongings. If the ceiling is bulging, keep the area clear.</p></div></Reveal>
            <Reveal className={styles.step}><div><h3>Call Brandon directly</h3><p>Tell us what you see, when it started, and your location. We’ll prioritize active leaks and storm exposure.</p></div></Reveal>
            <Reveal className={styles.step}><div><h3>Document from the ground</h3><p>Take safe photos of interior water and visible exterior damage for your records and insurance conversation.</p></div></Reveal>
          </div>
        </div>
      </section>

      <EstimatePanel compact />
    </main>
  );
}
