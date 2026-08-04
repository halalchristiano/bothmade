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

const roofingScope = [
  {
    number: '01',
    title: 'Complete roof replacement',
    text: 'Full tear-offs, re-roofing, additions, and new-construction roofing—planned as a complete system rather than a surface-level patch.',
  },
  {
    number: '02',
    title: 'Leak finding & repair',
    text: 'Careful assessment of active leaks, storm damage, roof penetrations, boot collars, skylights, chimney flashing, and wall flashing.',
  },
  {
    number: '03',
    title: 'Specialty roof systems',
    text: 'Hands-on experience with architectural shingle, slate, flat, rolled, TPO, EPDM, and torch-down roofing for homes and businesses.',
  },
  {
    number: '04',
    title: 'Drainage & exterior protection',
    text: 'Seamless gutters, leaders, siding, soffit, fascia, and replacement windows working together to move water out and keep weather out.',
  },
];

const process = [
  ['01', 'Look closely', 'We inspect the roof, attic clues, flashing, drainage, and surrounding exterior—not just the first visible symptom.'],
  ['02', 'Explain plainly', 'You get a direct assessment, practical options, and a free written estimate without a high-pressure sales handoff.'],
  ['03', 'Build responsibly', 'An experienced crew completes the agreed scope with the owner accountable for workmanship and communication.'],
  ['04', 'Leave it finished', 'We clean the property, review the completed work, and make sure the roof is ready for New Jersey weather.'],
];

const faqs = [
  {
    question: 'Do you handle both repairs and full roof replacements?',
    answer: 'Yes. Brandon Roofing handles isolated leak repairs, storm damage, flashing and skylight issues, full tear-offs, re-roofing, additions, and new-construction roofing. The first step is an inspection to determine whether repair or replacement is the responsible recommendation.',
  },
  {
    question: 'What types of roofing do you work on?',
    answer: 'The team works on residential and commercial roofing, including architectural shingles, slate, flat and rolled roofing, TPO, EPDM, and torch-down systems. They also repair chimney flashing, wall flashing, roof penetrations, and leaking skylights.',
  },
  {
    question: 'Can you respond to an active leak or storm damage?',
    answer: 'Yes. Emergency roof repair is available 24 hours a day, seven days a week. If water is entering the building, call 973-584-7717 so the team can prioritize stopping further damage.',
  },
  {
    question: 'Do you offer gutters, siding, and windows too?',
    answer: 'Yes. Brandon Roofing installs seamless gutters and leaders, performs gutter repair and cleaning, and provides siding and replacement-window work so the full exterior can be considered together.',
  },
  {
    question: 'Where do you work—and are estimates free?',
    answer: 'Free, no-obligation estimates are available throughout Morris County and surrounding areas, including communities across Sussex, Passaic, Warren, Hunterdon, Somerset, Union, Bergen, and Essex counties.',
  },
];

const inspectionItems = [
  ['Popping nails', 'Raised fasteners can lift shingles and create a direct path for wind-driven rain.'],
  ['Missing or cracked shingles', 'Small visible failures often reveal larger weathering patterns across the roof plane.'],
  ['Mold and trapped moisture', 'Dark growth and persistent dampness can point to ventilation or drainage problems.'],
  ['Loose ridge vents', 'The highest seam on the roof needs to stay secure while allowing the attic to breathe.'],
  ['Ice-and-water protection', 'Valleys, eaves, and vulnerable edges are checked for the defense needed against ice damming.'],
  ['Pipe boots and penetrations', 'Rubber collars and seals age faster than shingles and are a frequent source of hard-to-find leaks.'],
  ['Skylights and debris', 'We inspect the frame, flashing, seals, and the areas where leaves and water collect.'],
  ['Wall and chimney flashing', 'Cracks, gaps, counter-flashing, and failing sealant are checked where roof planes meet masonry or walls.'],
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

      <div className={styles.expertiseMarquee} aria-label="Brandon Roofing areas of expertise">
        <div>
          <span>Shingle roofing</span><i>◆</i><span>Flat roofing</span><i>◆</i><span>Slate roofing</span><i>◆</i><span>Chimney flashing</span><i>◆</i><span>Gutters & leaders</span><i>◆</i><span>Emergency repair</span><i>◆</i>
          <span>Shingle roofing</span><i>◆</i><span>Flat roofing</span><i>◆</i><span>Slate roofing</span><i>◆</i><span>Chimney flashing</span><i>◆</i><span>Gutters & leaders</span><i>◆</i><span>Emergency repair</span><i>◆</i>
        </div>
      </div>

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

      <section className={styles.scopeSection}>
        <div className={styles.scopeIntro}>
          <Reveal>
            <span className={styles.sectionIndex}>04 · The full scope</span>
            <h2>One call.<br />The whole exterior.</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p>
              The original Brandon Roofing promise is simple: experienced roofers, quality
              materials, reasonable pricing, and work completed correctly the first time.
              That means diagnosing the cause—not selling the biggest project.
            </p>
            <p>
              From a leaking skylight to a commercial flat roof, Chris brings more than three
              decades of hands-on experience to the details that determine whether a roof lasts.
            </p>
          </Reveal>
        </div>
        <div className={styles.scopeGrid}>
          {roofingScope.map((item, index) => (
            <Reveal key={item.title} className={styles.scopeItem} delay={(index % 2) * 0.06}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </Reveal>
          ))}
        </div>
        <div className={styles.materialBand}>
          <span>Materials selected for the property</span>
          <strong>GAF</strong><strong>CertainTeed</strong><strong>Owens Corning</strong>
          <span>Warranty options available</span>
        </div>
      </section>

      <section id="story" className={styles.story}>
        <div className={styles.storyVisual}>
          <Image className={styles.storyImage} src="/brandon/about.jpg" alt="Roofing professionals working together safely" fill sizes="(max-width: 980px) 100vw, 50vw" />
          <div className={styles.storyBadge}>The owner’s eye on every detail.</div>
        </div>
        <Reveal className={styles.storyCopy}>
          <span className={styles.sectionIndex}>05 · Small by design</span>
          <h2>Accountability has a name.</h2>
          <p>
            Chris has spent more than 30 years working across shingle, flat, slate, flashing,
            gutters, and leaders. Brandon Roofing isn’t a national franchise or a lead broker;
            it is a local company built on repeat calls, neighbor-to-neighbor recommendations,
            and an owner who takes pride in getting the work right the first time.
          </p>
          <div className={styles.storyPoints}>
            <div><strong>35+</strong><span>Years local</span></div>
            <div><strong>1</strong><span>Owner accountable</span></div>
          </div>
          <ArrowLink href="#estimate" light>Start with an honest inspection</ArrowLink>
        </Reveal>
      </section>

      <section className={styles.processSection}>
        <div className={styles.processHead}>
          <Reveal>
            <span className={styles.sectionIndex}>06 · What happens next</span>
            <h2>A straightforward job<br />from first look to final sweep.</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p>Clear answers, a defined scope, and one accountable local team from inspection through cleanup.</p>
          </Reveal>
        </div>
        <div className={styles.processGrid}>
          {process.map(([number, title, text], index) => (
            <Reveal key={title} className={styles.processStep} delay={index * 0.06}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className={styles.inspectionSection}>
        <div className={styles.inspectionLead}>
          <Reveal>
            <span className={styles.sectionIndex}>07 · The inspection</span>
            <p className={styles.inspectionKicker}>A roof rarely fails all at once.</p>
            <h2>We look for the small things <em>before</em> they become expensive things.</h2>
            <p>
              Brandon’s original winter-readiness inspection is still one of the clearest
              expressions of how the company works: look closely, maintain what can be saved,
              and identify vulnerabilities before leaves, snow, and ice make them worse.
            </p>
          </Reveal>
        </div>
        <div className={styles.inspectionList}>
          {inspectionItems.map(([title, text], index) => (
            <Reveal key={title} className={styles.inspectionItem} delay={(index % 3) * 0.035}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className={styles.reviews}>
        <div className={styles.sectionHead}>
          <Reveal>
            <span className={styles.sectionIndex}>08 · Around the neighborhood</span>
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

      <section className={styles.faqSection}>
        <div className={styles.faqIntro}>
          <Reveal>
            <span className={styles.sectionIndex}>09 · Before we climb the ladder</span>
            <h2>Good questions.<br />Direct answers.</h2>
            <p>What homeowners and property managers usually want to know before scheduling an inspection.</p>
          </Reveal>
        </div>
        <div className={styles.faqList}>
          {faqs.map((faq, index) => (
            <Reveal key={faq.question} delay={index * 0.04}>
              <details className={styles.faqItem}>
                <summary><span>0{index + 1}</span>{faq.question}<i aria-hidden="true">+</i></summary>
                <p>{faq.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      <EstimatePanel />
    </main>
  );
}
