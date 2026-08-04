import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { EstimatePanel, Reveal, TrustRail } from '../BrandonUI';
import styles from '../brandon.module.css';

const serviceRows = [
  ['Residential roofing', 'Complete replacements, targeted repairs, inspections, flashing, skylights, and ventilation—planned for the home rather than sold from a preset package.'],
  ['Commercial & flat roofing', 'TPO, EPDM, torch-down modified bitumen, rolled roofing, and maintenance for low-slope residential and commercial properties.'],
  ['Seamless gutters', 'Measured and formed on site, with downspouts and drainage planned to protect foundations, siding, landscaping, and entrances.'],
  ['Siding & windows', 'Vinyl siding, trim, soffit, fascia, and replacement windows designed as one coherent exterior system.'],
  ['Emergency repair', 'Fast response for active leaks, wind damage, fallen limbs, failed flashing, and the urgent temporary protection your property needs.'],
];

export default function ServicesPage() {
  return (
    <main>
      <section className={styles.pageHero}>
        <div className={styles.pageHeroCopy}>
          <Reveal>
            <span className={styles.eyebrow}>What we build</span>
            <h1>One exterior.<br />No weak links.</h1>
            <p>Roofing, drainage, siding, and windows considered together—because weather never tests just one part of a home.</p>
          </Reveal>
        </div>
        <div className={styles.pageHeroVisual}>
          <Image src="/brandon/residential.jpg" alt="Finished residential roof and exterior" fill priority sizes="(max-width: 980px) 100vw, 50vw" />
          <span className={styles.pageHeroCaption}>Residential roofing · Morris County, NJ</span>
        </div>
      </section>
      <TrustRail />

      <section className={styles.serviceListPage}>
        {serviceRows.map(([title, text], index) => (
          <Reveal key={title} className={styles.serviceRow}>
            <span>0{index + 1}</span>
            <h2>{title}</h2>
            <p>{text}</p>
            <Link href="#estimate" aria-label={`Request an estimate for ${title}`}><ArrowUpRight size={19} /></Link>
          </Reveal>
        ))}
      </section>

      <section className={styles.materials}>
        <div className={styles.materialsInner}>
          <div className={styles.materialsIntro}>
            <span className={styles.sectionIndex}>Materials, explained plainly</span>
            <Reveal><h2>The right system for the actual roof.</h2></Reveal>
          </div>
          <div className={styles.materialGrid}>
            {[
              ['01', 'Architectural shingles', 'GAF, CertainTeed, and Owens Corning systems selected for profile, warranty, and exposure.'],
              ['02', 'Low-slope membranes', 'TPO and EPDM systems for reliable commercial and residential flat-roof performance.'],
              ['03', 'Metal & flashing', 'Precision details around chimneys, walls, valleys, and roof edges—the places that decide longevity.'],
            ].map(([number, title, text]) => (
              <Reveal key={title} className={styles.material}>
                <span>{number}</span><h3>{title}</h3><p>{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <EstimatePanel />
    </main>
  );
}
