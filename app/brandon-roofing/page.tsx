import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { ArrowLink, EstimatePanel, Reveal, RoofLayers, TrustRail } from './BrandonUI';
import styles from './brandon.module.css';

const services = [
  {
    number: '01',
    title: 'Residential roofing',
    text: 'Full replacements, precision repairs, flashing, skylights, and honest inspections.',
    image: '/brandon/residential.jpg',
  },
  {
    number: '02',
    title: 'Commercial & flat roofs',
    text: 'TPO, EPDM, torch-down, and practical maintenance for New Jersey properties.',
    image: '/brandon/commercial.jpg',
  },
  {
    number: '03',
    title: 'Seamless gutters',
    text: 'Measured on site and made to move water safely away from your home.',
    image: '/brandon/gutters.jpg',
  },
  {
    number: '04',
    title: 'Siding & windows',
    text: 'A complete exterior system designed for curb appeal, comfort, and weather.',
    image: '/brandon/siding.jpg',
  },
];

const reviews = [
  {
    quote: 'Excellent work, fair price, and the whole roof was completed in one day.',
    name: 'Mike T.',
    town: 'Roxbury, NJ',
  },
  {
    quote: 'They came out the same day after the storm and fixed the leak fast.',
    name: 'Jennifer R.',
    town: 'Randolph, NJ',
  },
  {
    quote: 'Clean work, on time, and great communication from beginning to end.',
    name: 'Dave S.',
    town: 'Denville, NJ',
  },
];

export default function BrandonHome() {
  return (
    <main>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <Reveal>
            <span className={styles.eyebrow}>Locally owned · Morris County, New Jersey</span>
            <h1 className={styles.display}>The owner is on <em>every job.</em></h1>
            <div className={styles.redStroke} aria-hidden="true" />
            <p>
              No call centers. No mystery crews. Just 35 years of roofing knowledge,
              a direct answer, and work done right the first time.
            </p>
            <div className={styles.heroActions}>
              <Link href="#estimate" className={styles.primaryButton}>Get a free estimate <ArrowRight size={18} /></Link>
              <Link href="/brandon-roofing/emergency" className={styles.secondaryButton}>Emergency repair <ArrowUpRight size={18} /></Link>
            </div>
          </Reveal>
          <div className={styles.heroNote}>
            <span><ShieldCheck size={16} /> Fully licensed & insured</span>
            <span><CheckCircle2 size={16} /> 5.0 stars · 52 reviews</span>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <Image className={styles.heroImage} src="/brandon/hero.jpg" alt="A carefully installed shingle roof surrounded by mature trees" fill priority sizes="(max-width: 980px) 100vw, 55vw" />
          <div className={styles.heroScrim} />
          <div className={styles.roofTrace} aria-hidden="true" />
          <div className={styles.heroVisualLabel}>
            <strong>Built above<br />the ordinary.</strong>
            <span>Landing, NJ · 40.9001° N</span>
          </div>
        </div>
      </section>

      <TrustRail />

      <section className={styles.statement}>
        <div className={styles.statementGrid}>
          <Reveal><span className={styles.sectionIndex}>01 · The promise</span></Reveal>
          <Reveal delay={0.08}>
            <h2>A roof is more than shingles. <span>It’s the quiet above your life.</span></h2>
          </Reveal>
          <div className={styles.statementFooter}>
            <p>
              We treat every home like the owner is watching—because he is. From the first
              inspection through the final cleanup, responsibility never gets passed down a chain.
            </p>
            <div>
              <div className={styles.signature}>Built to last,</div>
              <p>Brandon Roofing · Local since 1990</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.weather}>
        <Image className={styles.weatherImage} src="/brandon/commercial.jpg" alt="A New Jersey property protected during winter weather" fill sizes="100vw" />
        <div className={styles.rain} aria-hidden="true" />
        <Reveal className={styles.weatherCopy}>
          <div className={styles.weatherStatus}><span className={styles.liveDot} /> Crews available · 24/7</div>
          <span className={styles.sectionIndex}>02 · Weather intelligence</span>
          <h2>Ready for whatever comes.</h2>
          <p>
            New Jersey weather tests every seam. We build the whole system—not just the
            surface—to manage wind, water, heat, ice, and time.
          </p>
          <div className={styles.heroActions}>
            <Link href="/brandon-roofing/emergency" className={styles.primaryButton}>I have an active leak <ArrowRight size={18} /></Link>
          </div>
        </Reveal>
        <RoofLayers />
      </section>

      <section id="work" className={styles.services}>
        <div className={styles.sectionHead}>
          <Reveal>
            <span className={styles.sectionIndex}>03 · One exterior, considered together</span>
            <h2>Work that protects.<br />Details that belong.</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p>Residential, commercial, and exterior work planned as one weather-tight system.</p>
            <ArrowLink href="/brandon-roofing/services">Explore every service</ArrowLink>
          </Reveal>
        </div>
        <div className={styles.serviceGrid}>
          {services.map((service, index) => (
            <Reveal key={service.title} className={styles.serviceCard} delay={(index % 2) * 0.08}>
              <Image className={styles.serviceImage} src={service.image} alt={service.title} fill sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 58vw" />
              <span className={styles.serviceNumber}>{service.number}</span>
              <div className={styles.serviceContent}>
                <div>
                  <h3>{service.title}</h3>
                  <p>{service.text}</p>
                </div>
                <Link href="/brandon-roofing/services" className={styles.cardArrow} aria-label={`Learn about ${service.title}`}><ArrowUpRight size={20} /></Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="story" className={styles.story}>
        <div className={styles.storyVisual}>
          <Image className={styles.storyImage} src="/brandon/about.jpg" alt="Roofing professionals working together safely" fill sizes="(max-width: 980px) 100vw, 50vw" />
          <div className={styles.storyBadge}>The owner’s eye on every detail.</div>
        </div>
        <Reveal className={styles.storyCopy}>
          <span className={styles.sectionIndex}>04 · Small by design</span>
          <h2>Accountability has a name.</h2>
          <p>
            Brandon Roofing isn’t a national franchise or a lead broker. It’s a local company
            built on repeat calls, neighbor-to-neighbor recommendations, and the kind of work
            you’re still proud to point at years later.
          </p>
          <div className={styles.storyPoints}>
            <div><strong>35+</strong><span>Years local</span></div>
            <div><strong>1</strong><span>Owner accountable</span></div>
          </div>
          <ArrowLink href="#estimate" light>Start with an honest inspection</ArrowLink>
        </Reveal>
      </section>

      <section className={styles.reviews}>
        <div className={styles.sectionHead}>
          <Reveal>
            <span className={styles.sectionIndex}>05 · Around the neighborhood</span>
            <h2>Five stars,<br />earned locally.</h2>
          </Reveal>
          <p>52 verified Google reviews from homeowners across Morris and Sussex County.</p>
        </div>
        <div className={styles.reviewsGrid}>
          {reviews.map((review, index) => (
            <Reveal key={review.name} className={styles.review} delay={index * 0.07}>
              <div className={styles.stars}>{Array.from({ length: 5 }).map((_, star) => <span key={star}>★</span>)}</div>
              <blockquote>“{review.quote}”</blockquote>
              <footer><span>{review.name}</span><span>{review.town}</span></footer>
            </Reveal>
          ))}
        </div>
      </section>

      <section className={styles.serviceArea}>
        <div className={styles.serviceAreaInner}>
          <Reveal><span className={styles.eyebrow} style={{ color: 'white' }}>Right around the corner</span><h2>Local means we know the weather here.</h2></Reveal>
          <Reveal className={styles.towns} delay={0.08}>
            {['Roxbury', 'Randolph', 'Denville', 'Rockaway', 'Mount Olive', 'Chester', 'Dover', 'Morristown', 'Sparta', 'Byram', 'Parsippany', 'Hopatcong'].map((town) => <span key={town}>{town}, NJ</span>)}
          </Reveal>
        </div>
      </section>

      <EstimatePanel />
    </main>
  );
}
