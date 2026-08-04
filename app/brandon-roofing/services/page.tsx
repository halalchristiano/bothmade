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

const serviceDepth = [
  {
    number: '01',
    eyebrow: 'Residential roofing',
    title: 'From a few shingles to a complete tear-off.',
    copy: 'Brandon Roofing installs and repairs traditional asphalt shingles, architectural systems, slate, wood-style products, and tile. The same experienced eye is applied whether the job is a small repair, an addition, a buyer’s inspection, or a whole-roof replacement.',
    items: ['Complete re-roofing and tear-offs', 'Additions and new construction', 'Leak assessment and targeted repair', 'Homebuyer baseline inspections', 'Skylights, pipe boots, wall and chimney flashing', 'Ventilation and winter-readiness checks'],
  },
  {
    number: '02',
    eyebrow: 'Commercial & flat roofing',
    title: 'Water has nowhere to go. Details matter more.',
    copy: 'Flat roofs hold rain, snow, and debris longer than pitched roofs. Once moisture enters, it can saturate the structure beneath. Brandon works with owners, managers, and tenants across apartment buildings, retail spaces, factories, schools, and other commercial properties.',
    items: ['Commercial tear-offs and installation', 'Flat and rolled-roof leak repair', 'TPO, EPDM, and modified-bitumen systems', 'Roof coatings and maintenance programs', 'Snow and debris removal', 'Buyer and property-condition inspections'],
  },
  {
    number: '03',
    eyebrow: 'Gutters & leaders',
    title: 'The most overlooked part of the roof system.',
    copy: 'Gutters and leaders protect siding, landscaping, basements, and foundations. Aluminum runs are measured on site, fitted to the home, installed with concealed hangers and rust-resistant accessories, then paired with downspouts that move water where it can safely drain.',
    items: ['On-site measuring and seamless fabrication', 'Aluminum gutters, leaders, and downspouts', 'Concealed hidden-hanger installation', 'Color options selected for the exterior', 'Repair, cleaning, and inspection', 'Drainage-layout and maintenance guidance'],
  },
  {
    number: '04',
    eyebrow: 'Siding & replacement windows',
    title: 'Protection, comfort, and a different first impression.',
    copy: 'Siding is more than a cosmetic finish: it shields the wall assembly from rain, snow, pests, mold, and moisture. Properly installed replacement windows refresh the exterior while improving comfort and reducing heating and cooling loss.',
    items: ['Vinyl siding in varied profiles and colors', 'Horizontal, vertical, shake, and shingle looks', 'Soffit, fascia, trim, and moisture barriers', 'Double-hung, bay, bow, wood, and fiberglass windows', 'Double-glazed and Energy Star options', 'Replacement doors and exterior finishing'],
  },
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

      <section className={styles.serviceDepthSection}>
        <div className={styles.serviceDepthLead}>
          <Reveal>
            <span className={styles.sectionIndex}>The full Brandon Roofing scope</span>
            <h2>Nothing important edited out.</h2>
            <p>Every service Chris has built the company around—organized clearly, explained honestly, and presented with the depth it deserves.</p>
          </Reveal>
        </div>
        <div className={styles.serviceDepthList}>
          {serviceDepth.map((service) => (
            <article key={service.title} className={styles.serviceDepthArticle}>
              <div className={styles.serviceDepthTitle}>
                <span>{service.number} · {service.eyebrow}</span>
                <Reveal><h2>{service.title}</h2></Reveal>
              </div>
              <div className={styles.serviceDepthBody}>
                <Reveal><p>{service.copy}</p></Reveal>
                <ul>
                  {service.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
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
