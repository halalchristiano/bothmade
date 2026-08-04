'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CloudRain, Phone, ShieldCheck, Snowflake, Sun, Wind } from 'lucide-react';
import styles from './immersive.module.css';

const weather = [
  { icon: Wind, label: 'Wind', value: '75+', unit: 'MPH', note: 'Edges, flashing, and fastening patterns carry the load.' },
  { icon: CloudRain, label: 'Rain', value: '4.2', unit: 'IN/HR', note: 'Underlayment and drainage become the second roof.' },
  { icon: Snowflake, label: 'Snow', value: '30', unit: 'PSF', note: 'Structure, ventilation, and ice protection work together.' },
  { icon: Sun, label: 'Heat', value: '160', unit: '°F', note: 'A ventilated deck protects the roof from the inside out.' },
];

const services = [
  { number: '01', title: 'Residential', text: 'Complete tear-offs, architectural shingles, slate, additions, repairs, and buyer inspections.', image: '/brandon/residential.jpg' },
  { number: '02', title: 'Commercial', text: 'TPO, EPDM, torch-down, rolled systems, coatings, inspections, and maintenance programs.', image: '/brandon/commercial.jpg' },
  { number: '03', title: 'Water control', text: 'Seamless gutters, leaders, hidden hangers, downspouts, cleaning, and drainage planning.', image: '/brandon/gutters.jpg' },
  { number: '04', title: 'The exterior', text: 'Siding, soffit, fascia, trim, replacement windows, and the envelope beneath them.', image: '/brandon/siding.jpg' },
];

const diagnostics = [
  ['01', 'Popping nails', 'A small lift can become a wind-and-water entry point.'],
  ['02', 'Pipe boots', 'Rubber seals often age before the surrounding shingles.'],
  ['03', 'Ice dams', 'Protection at eaves and valleys matters when meltwater backs up.'],
  ['04', 'Skylights', 'Frames, flashing, seals, and debris paths all need inspection.'],
  ['05', 'Ridge vents', 'The roof must stay closed to weather and open to ventilation.'],
  ['06', 'Chimney flashing', 'Transitions and masonry joints decide whether water stays out.'],
];

function MagneticLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 250, damping: 18 });
  const springY = useSpring(y, { stiffness: 250, damping: 18 });

  return (
    <motion.a
      href={href}
      className={className}
      style={{ x: springX, y: springY }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) * 0.16);
        y.set((event.clientY - rect.top - rect.height / 2) * 0.16);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.a>
  );
}

export default function ImmersiveRoofing() {
  const pageRef = useRef<HTMLDivElement>(null);
  const weatherRef = useRef<HTMLElement>(null);
  const anatomyRef = useRef<HTMLElement>(null);
  const servicesRef = useRef<HTMLElement>(null);
  const [diagnostic, setDiagnostic] = useState(0);
  const pointerX = useMotionValue(-100);
  const pointerY = useMotionValue(-100);
  const cursorX = useSpring(pointerX, { stiffness: 500, damping: 35 });
  const cursorY = useSpring(pointerY, { stiffness: 500, damping: 35 });
  const { scrollYProgress } = useScroll();
  const pageProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const heroScale = useTransform(scrollYProgress, [0, 0.12], [1, 1.16]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.11], [1, 0.14]);
  const heroTextY = useTransform(scrollYProgress, [0, 0.1], [0, -180]);

  const { scrollYProgress: weatherProgress } = useScroll({ target: weatherRef, offset: ['start start', 'end end'] });
  const weatherImageScale = useTransform(weatherProgress, [0, 1], [1.05, 1.32]);
  const weatherReadout = useTransform(weatherProgress, [0, .33, .66, 1], ['0%', '33%', '66%', '100%']);

  const { scrollYProgress: anatomyProgress } = useScroll({ target: anatomyRef, offset: ['start start', 'end end'] });
  const layerOneY = useTransform(anatomyProgress, [0, .25, .85], [210, 40, -80]);
  const layerTwoY = useTransform(anatomyProgress, [0, .4, .9], [260, 100, -15]);
  const layerThreeY = useTransform(anatomyProgress, [0, .58, 1], [320, 165, 65]);
  const anatomyRotate = useTransform(anatomyProgress, [0, 1], [-8, 4]);
  const anatomyPercent = useTransform(anatomyProgress, [0, 1], ['00', '100']);

  const { scrollYProgress: serviceProgress } = useScroll({ target: servicesRef, offset: ['start start', 'end end'] });
  const serviceX = useTransform(serviceProgress, [0, 1], ['4vw', '-246vw']);

  return (
    <div
      ref={pageRef}
      className={styles.site}
      onPointerMove={(event) => { pointerX.set(event.clientX); pointerY.set(event.clientY); }}
    >
      <motion.div className={styles.cursor} style={{ x: cursorX, y: cursorY }} />
      <motion.div className={styles.progress} style={{ scaleX: pageProgress }} />

      <header className={styles.header}>
        <Link href="/brandon-roofing-v2" className={styles.logo}>
          <span>BR</span><i /> <small>Roof intelligence<br />since 1990</small>
        </Link>
        <nav>
          <a href="#system">The system</a>
          <a href="#services">Capabilities</a>
          <a href="#diagnostics">Inspection</a>
        </nav>
        <MagneticLink href="tel:9735847717" className={styles.headerCall}><Phone size={15} /> 973 584 7717</MagneticLink>
      </header>

      <main>
        <section className={styles.hero}>
          <motion.div className={styles.heroMedia} style={{ scale: heroScale, opacity: heroOpacity }}>
            <Image src="/brandon/hero.jpg" alt="Architectural roof surrounded by New Jersey woodland" fill priority sizes="100vw" />
          </motion.div>
          <div className={styles.heroGrid} aria-hidden="true" />
          <motion.div className={styles.heroContent} style={{ y: heroTextY }}>
            <div className={styles.heroMeta}><span>40.9001° N</span><span>Landing, New Jersey</span><span>System online</span></div>
            <h1><span>Your roof is</span><strong>an operating system.</strong></h1>
            <div className={styles.heroBottom}>
              <p>Every shingle, seam, vent, fastener, drain, and flashing detail has one job: keep New Jersey weather outside.</p>
              <MagneticLink href="#system" className={styles.roundLink}><ArrowDown size={26} /></MagneticLink>
            </div>
          </motion.div>
          <div className={styles.heroRail}><span>Scroll to run weather simulation</span><i /></div>
        </section>

        <section ref={weatherRef} id="system" className={styles.weatherStage}>
          <div className={styles.weatherSticky}>
            <motion.div className={styles.weatherMedia} style={{ scale: weatherImageScale }}>
              <Image src="/brandon/commercial.jpg" alt="Roof system exposed to winter weather" fill sizes="100vw" />
            </motion.div>
            <div className={styles.weatherOverlay} />
            <div className={styles.weatherTopline}><span>BR / WEATHER LAB</span><motion.span>{weatherReadout}</motion.span></div>
            <div className={styles.weatherTitle}>
              <span>Test 01</span>
              <h2>Built for the weather<br />you haven’t seen <em>yet.</em></h2>
            </div>
            <div className={styles.weatherCards}>
              {weather.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.article
                    key={item.label}
                    className={styles.weatherCard}
                    initial={{ opacity: .25, y: 35 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ margin: '-20% 0px -35%' }}
                    transition={{ delay: index * .08 }}
                  >
                    <div><Icon size={19} /><span>{item.label}</span></div>
                    <strong>{item.value}<small>{item.unit}</small></strong>
                    <p>{item.note}</p>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <section ref={anatomyRef} className={styles.anatomy}>
          <div className={styles.anatomySticky}>
            <div className={styles.anatomyCopy}>
              <span>02 / ROOF ANATOMY</span>
              <h2>What you see is only<br /><em>the first layer.</em></h2>
              <p>Drag the page through the system. Each layer is selected, installed, and inspected as part of one continuous defense.</p>
            </div>
            <motion.div className={styles.layerMachine} style={{ rotate: anatomyRotate }}>
              <motion.article className={`${styles.roofLayer} ${styles.layerOne}`} style={{ y: layerOneY }}>
                <span>01</span><div><h3>Architectural shingle</h3><p>Impact. Wind. Sun. The visible finish takes the first hit.</p></div>
              </motion.article>
              <motion.article className={`${styles.roofLayer} ${styles.layerTwo}`} style={{ y: layerTwoY }}>
                <span>02</span><div><h3>Waterproof membrane</h3><p>Ice-and-water defense at eaves, valleys, walls, and penetrations.</p></div>
              </motion.article>
              <motion.article className={`${styles.roofLayer} ${styles.layerThree}`} style={{ y: layerThreeY }}>
                <span>03</span><div><h3>Ventilated structure</h3><p>Decking, airflow, and the hidden condition that determines longevity.</p></div>
              </motion.article>
            </motion.div>
            <div className={styles.anatomyCounter}><span>System separation</span><motion.strong>{anatomyPercent}</motion.strong><i>%</i></div>
          </div>
        </section>

        <section ref={servicesRef} id="services" className={styles.servicesStage}>
          <div className={styles.servicesSticky}>
            <div className={styles.servicesHead}><span>03 / CAPABILITIES</span><h2>One crew.<br />Every weak point.</h2></div>
            <motion.div className={styles.serviceTrack} style={{ x: serviceX }}>
              {services.map((service) => (
                <article key={service.title} className={styles.serviceCard}>
                  <Image src={service.image} alt={service.title} fill sizes="80vw" />
                  <div className={styles.serviceShade} />
                  <span>{service.number}</span>
                  <div><h3>{service.title}</h3><p>{service.text}</p><ArrowUpRight size={28} /></div>
                </article>
              ))}
            </motion.div>
          </div>
        </section>

        <section id="diagnostics" className={styles.diagnostics}>
          <div className={styles.diagnosticHead}>
            <span>04 / DIAGNOSTIC MODE</span>
            <h2>Find the failure<br />before it finds <em>you.</em></h2>
            <p>Move through the details Chris checks during a roof inspection.</p>
          </div>
          <div className={styles.diagnosticInterface}>
            <div className={styles.diagnosticButtons}>
              {diagnostics.map(([number, title], index) => (
                <button key={title} onPointerEnter={() => setDiagnostic(index)} onFocus={() => setDiagnostic(index)} onClick={() => setDiagnostic(index)} className={diagnostic === index ? styles.diagnosticActive : ''}>
                  <span>{number}</span>{title}<ArrowRight size={18} />
                </button>
              ))}
            </div>
            <div className={styles.diagnosticScreen}>
              <div className={styles.scanGrid} />
              <div className={styles.scanPulse} />
              <AnimatePresence mode="wait">
                <motion.div key={diagnostic} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: .3 }}>
                  <span>{diagnostics[diagnostic][0]} / DETECTED</span>
                  <h3>{diagnostics[diagnostic][1]}</h3>
                  <p>{diagnostics[diagnostic][2]}</p>
                  <strong><Check size={18} /> Included in Brandon inspection</strong>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </section>

        <section className={styles.ownerSection}>
          <div className={styles.ownerMedia}><Image src="/brandon/about.jpg" alt="Roofing professionals working together" fill sizes="50vw" /></div>
          <div className={styles.ownerCopy}>
            <span>05 / HUMAN OVERSIGHT</span>
            <h2>Technology is the interface.<br /><em>Chris is the accountability.</em></h2>
            <p>More than 30 years across shingle, flat, slate, flashing, gutters, and leaders. No call center. No mystery handoff. The owner stays connected to the work and the result.</p>
            <div><strong>35+</strong><span>Years serving New Jersey</span><strong>24/7</strong><span>Emergency response</span></div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.ctaOrbit} aria-hidden="true"><i /><i /><i /></div>
          <span>BRANDON ROOFING / LANDING NJ</span>
          <h2>Put your roof<br />through the system.</h2>
          <p>A direct inspection. A clear recommendation. A free estimate.</p>
          <div>
            <MagneticLink href="tel:9735847717" className={styles.ctaPrimary}>Call 973-584-7717 <Phone size={19} /></MagneticLink>
            <MagneticLink href="mailto:info@brandon-roofing.com" className={styles.ctaSecondary}>Start by email <ArrowUpRight size={19} /></MagneticLink>
          </div>
          <footer><span><ShieldCheck size={15} /> Licensed & insured</span><span>Open 7 days</span><span>© 2026 Brandon Roofing</span></footer>
        </section>
      </main>
    </div>
  );
}
