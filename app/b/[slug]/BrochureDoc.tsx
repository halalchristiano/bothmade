import type { CSSProperties } from 'react';
import {
  comparisonLines,
  customItemPrice,
  type Brochure,
  type BrochureChapter,
  type BrochureLine,
  type BrochureTier,
} from '@/lib/brochure';
import { COMPANY_EMAIL, COMPANY_NAME } from '@/lib/company';
import styles from './brochure.module.css';

/**
 * The brochure, laid out as fixed pages.
 *
 * Page numbering is done by walking a list rather than by a counter each
 * component increments, so a page added in the middle cannot silently
 * renumber everything after it into disagreeing with the folio on screen.
 */

/**
 * The three acts of the document, printed in the running header.
 *
 * Deliberately not the page's own eyebrow: repeating it two inches above
 * itself reads like a mistake, and a reader who has flipped to the middle
 * wants to know which part of the argument they are in, not to be told the
 * heading twice.
 */
const ACTS = {
  today: 'Your site today',
  concept: 'The concept',
  options: 'The options',
  detail: 'The detail',
} as const;

/** "a, b and c" — a brochure reads as prose, not as a comma-separated list. */
function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

interface PageProps {
  children: React.ReactNode;
  /** Printed top-left, so a reader who opens on page 9 knows where they are. */
  runner: string;
  folio: number;
  total: number;
  company: string;
  dark?: boolean;
  className?: string;
}

function Page({ children, runner, folio, total, company, dark, className }: PageProps) {
  return (
    <section
      className={[styles.page, dark ? styles.pageDark : '', className ?? ''].filter(Boolean).join(' ')}
    >
      <header className={styles.runner}>
        <span>{runner}</span>
        <span>{company}</span>
      </header>
      <div className={styles.main}>{children}</div>
      <footer className={styles.folio}>
        <span>{COMPANY_NAME}</span>
        <span>
          {folio} / {total}
        </span>
      </footer>
    </section>
  );
}

function Heading({ eyebrow, title, body, small }: { eyebrow: string; title: string; body?: string; small?: boolean }) {
  return (
    <div>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 className={[styles.title, small ? styles.titleSmall : ''].filter(Boolean).join(' ')}>{title}</h2>
      {body ? <p className={styles.body}>{body}</p> : null}
    </div>
  );
}

function Mark({ company, strapline }: { company: string; strapline: string }) {
  return (
    <div className={styles.mark}>
      <span className={styles.markBox} aria-hidden="true">
        {company.trim().charAt(0)}
      </span>
      <span>
        <span className={styles.markName}>{company.split(' ')[0]}</span>
        <br />
        <span className={styles.markSub}>{strapline}</span>
      </span>
    </div>
  );
}

function LineRow({ line, isNew }: { line: BrochureLine; isNew?: boolean }) {
  return (
    <li className={styles.lineItem}>
      <span className={styles.lineLabel}>
        {line.label}
        {isNew ? <span className={styles.newBadge}>New here</span> : null}
      </span>
      <span className={styles.linePrice}>{line.price}</span>
      <span className={styles.lineWhat}>{line.description}</span>
      <span className={styles.lineWhy}>{line.benefit}</span>
    </li>
  );
}

function ChapterPage({
  chapter,
  ...page
}: { chapter: BrochureChapter } & Omit<PageProps, 'children' | 'runner'>) {
  return (
    <Page {...page} runner={ACTS.concept}>
      <div className={styles.chapterBody}>
        <Heading
          eyebrow={chapter.section.eyebrow}
          title={chapter.section.title}
          body={chapter.section.body}
          small
        />

        <div className={styles.shots}>
          {chapter.shots.map((shot) => (
            <figure key={shot.src} className={styles.shotFigure}>
              <div
                className={styles.shotFrame}
                // The frame takes the picture's shape, so nothing is cropped
                // and nothing floats in a slab of empty colour.
                style={{ aspectRatio: `${shot.width} / ${shot.height}` } as CSSProperties}
              >
                {/* Plain <img>: this document is printed and saved as a PDF,
                    and the print pass has no chance to run a lazy loader. */}
                <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} />
              </div>
              <figcaption className={styles.shotCaption}>{shot.caption}</figcaption>
            </figure>
          ))}
        </div>

        {chapter.quote ? (
          <blockquote className={styles.quote}>
            <p className={styles.quoteText}>&ldquo;{chapter.quote.text}&rdquo;</p>
            <p className={styles.quoteBy}>{chapter.quote.attribution}</p>
          </blockquote>
        ) : null}

        {chapter.facts?.length ? (
          <div className={styles.facts}>
            {chapter.facts.map((fact) => (
              <div key={fact.label} className={styles.fact}>
                <p className={styles.factLabel}>{fact.label}</p>
                <p className={styles.factValue}>{fact.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Page>
  );
}

function TierPage({
  tier,
  showAll,
  ...page
}: { tier: BrochureTier; showAll: boolean } & Omit<PageProps, 'children' | 'runner'>) {
  // The first tier has nothing to contrast with, so it lists everything. The
  // two above it list only what they add — a reader comparing three copies of
  // the same list reads none of them.
  const lines = showAll ? tier.lines : tier.addedLines;
  // Past about half a dozen, a single column runs off the bottom of the page.
  const dense = lines.length > 6;

  return (
    <Page {...page} runner={ACTS.options}>
      <div className={styles.tierHead}>
        <div>
          <p className={styles.eyebrow}>{tier.key === 'recommended' ? 'Our recommendation' : 'Option'}</p>
          <h2 className={[styles.title, styles.titleSmall].join(' ')}>{tier.name}</h2>
          <p className={styles.body}>{tier.tagline}</p>
        </div>
        <div className={styles.tierTotal}>
          <p className={styles.tierTotalFigure}>{tier.total}</p>
          <p className={styles.tierTotalNote}>One-off, all in</p>
        </div>
      </div>

      <p className={styles.forWho}>{tier.forWho}</p>

      <ul className={[styles.lineList, dense ? styles.lineListDense : ''].filter(Boolean).join(' ')}>
        {!showAll ? (
          <li className={styles.lineItem}>
            <span className={styles.lineLabel}>Everything in the previous option</span>
            <span className={styles.linePrice}>Included</span>
            <span className={styles.lineWhat}>
              {tier.lines.length - lines.length} items carried forward, unchanged.
            </span>
          </li>
        ) : null}
        {lines.map((line) => (
          <LineRow key={line.key} line={line} isNew={!showAll} />
        ))}
      </ul>
    </Page>
  );
}

export function BrochureDoc({ brochure }: { brochure: Brochure }) {
  const {
    company,
    strapline,
    theme,
    cover,
    chapters,
    comparison,
    currentUrl,
    tiers,
    customItems,
    nextSteps,
    pricingNotes,
    signOff,
    glossary,
    schedule,
    conceptUrl,
    city,
    pageCount,
  } = brochure;

  const themeVars = {
    '--paper': theme.paper,
    '--paper-deep': theme.paperDeep,
    '--ink': theme.ink,
    '--bronze': theme.bronze,
    '--slate': theme.slate,
    '--line': theme.line,
  } as CSSProperties;

  const recommended = tiers.find((tier) => tier.key === 'recommended') ?? tiers[0];
  const coverShots = chapters.flatMap((chapter) => chapter.shots).slice(0, 3);
  const shared = { total: pageCount, company };

  const allLines = comparisonLines(tiers);

  // Split down the middle so all three columns stay visible on one page,
  // rather than the table running on to a second one where nothing can be
  // compared to anything.
  const half = Math.ceil(allLines.length / 2);
  const matrixColumns = [allLines.slice(0, half), allLines.slice(half)];
  const recurringLines = allLines.filter((line) => line.recurring);

  // One running counter, incremented in render order, so the folio on the
  // page and the position in the document can never disagree. Starts at 2:
  // the cover is page one and carries no folio of its own.
  let folio = 2;
  const next = () => folio++;

  return (
    <div className={styles.doc} style={themeVars}>
      {/* 1 — cover */}
      <section className={[styles.page, styles.cover].join(' ')}>
        <div className={styles.coverTop}>
          <Mark company={company} strapline={strapline} />
          <p className={styles.eyebrow}>{cover.eyebrow}</p>
          <h1 className={styles.coverTitle}>{cover.title}</h1>
        </div>

        <div className={styles.coverArt}>
          {coverShots.map((shot) => (
            <img key={shot.src} className={styles.coverShot} src={shot.src} alt={shot.alt} />
          ))}
        </div>

        <div className={styles.coverBottom}>
          <p className={styles.body}>{cover.standfirst}</p>
          <div className={styles.coverRule} />
          <div className={styles.coverMeta}>
            <span>{conceptUrl.replace(/^https?:\/\//, '')}</span>
            <span>{city}</span>
            <span>By {COMPANY_NAME}</span>
          </div>
        </div>
      </section>

      {/*
        The current site, before the concept rather than after it. A client
        who has already been shown something better reads a list of problems
        with what they have as a sales pitch; a client who is shown the
        problems first reads the concept as an answer.
      */}
      {comparison ? (
        <>
          <Page runner={ACTS.today} folio={next()} {...shared}>
            <div className={styles.chapterBody}>
              <Heading
                eyebrow={comparison.section.eyebrow}
                title={comparison.section.title}
                body={comparison.section.body}
                small
              />
              <p className={styles.preamble}>{comparison.preamble}</p>

              <div className={[styles.shots, styles.beforeShots].join(' ')}>
                {comparison.before.map((shot) => (
                  <figure key={shot.src} className={styles.shotFigure}>
                    <div
                      className={styles.shotFrame}
                      style={{ aspectRatio: `${shot.width} / ${shot.height}` } as CSSProperties}
                    >
                      <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} />
                    </div>
                    <figcaption className={styles.shotCaption}>{shot.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </Page>

          <Page runner={ACTS.today} folio={next()} {...shared}>
            <Heading
              eyebrow="Both ways"
              title="Nine things, as they are and as they could be."
              small
            />
            <table className={styles.versus}>
              <thead>
                <tr>
                  <th className={styles.colWhat}>&nbsp;</th>
                  <th className={styles.colToday}>{currentUrl.replace(/^https?:\/\/(www\.)?/, '')}</th>
                  <th className={styles.colConcept}>{conceptUrl.replace(/^https?:\/\//, '')}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row.what}>
                    <td className={styles.colWhat}>{row.what}</td>
                    <td className={styles.colToday}>{row.today}</td>
                    <td className={styles.colConcept}>{row.concept}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Page>
        </>
      ) : null}

      {/* the concept, chapter by chapter */}
      {chapters.map((chapter) => (
        <ChapterPage key={chapter.section.title} chapter={chapter} folio={next()} {...shared} />
      ))}

      {/* the three options */}
      {tiers.map((tier, index) => (
        <TierPage
          key={tier.key}
          tier={tier}
          showAll={index === 0}
          folio={next()}
          {...shared}
        />
      ))}

      {/* work that isn't a catalogue line */}
      <Page runner={ACTS.detail} folio={next()} {...shared}>
        <Heading
          eyebrow="Custom work"
          title="Four things this business needs that no catalogue has a box for."
          body="Each one is priced from the parts it is actually built out of, so the number below is a real number rather than a placeholder — and you can see exactly what makes it up."
          small
        />
        <ul className={styles.lineList}>
          {customItems.map((item) => (
            <li key={item.label} className={styles.lineItem}>
              <span className={styles.lineLabel}>
                {item.label}
                {item.includedIn ? (
                  <span className={styles.newBadge}>
                    In {tiers.find((tier) => tier.key === item.includedIn)?.name ?? item.includedIn}
                  </span>
                ) : null}
              </span>
              <span className={styles.linePrice}>{customItemPrice(item)}</span>
              <span className={styles.lineWhat}>{item.what}</span>
              <span className={styles.lineWhy}>{item.why}</span>
            </li>
          ))}
        </ul>
      </Page>

      {/* the three, side by side */}
      <Page runner={ACTS.detail} folio={next()} {...shared}>
        <Heading eyebrow="Compare" title="The three, next to each other." small />

        <div className={styles.tierGrid}>
          {tiers.map((tier) => (
            <div
              key={tier.key}
              className={[styles.tierCard, tier.key === recommended.key ? styles.tierCardPicked : '']
                .filter(Boolean)
                .join(' ')}
            >
              {tier.key === recommended.key ? <span className={styles.pickedFlag}>We&rsquo;d pick this</span> : null}
              <p className={styles.tierCardName}>{tier.name}</p>
              <p className={styles.tierCardFigure}>{tier.total}</p>
              <p className={styles.tierCardTag}>{tier.tagline}</p>
              <p className={styles.tierCardCount}>{tier.lines.length} included items</p>
            </div>
          ))}
        </div>

        <div className={styles.matrixPair}>
          {matrixColumns.map((rows, column) => (
            <table key={column} className={styles.matrix}>
              <thead>
                <tr>
                  <th>What you get</th>
                  {tiers.map((tier) => (
                    <th key={tier.key} className={styles.tick}>
                      {tier.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => (
                  <tr key={line.key}>
                    <td>{line.label}</td>
                    {tiers.map((tier) => (
                      <td key={tier.key} className={styles.tick}>
                        {tier.lines.some((included) => included.key === line.key) ? (
                          <strong>&#10003;</strong>
                        ) : (
                          <span className={styles.dash}>&mdash;</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>

        {recurringLines.length > 0 ? (
          <p className={styles.matrixNote}>
            <strong>One thing to know about the prices.</strong> Everything above is a one-off cost
            except {formatList(recurringLines.map((line) => line.label))} — those carry on monthly
            once the first month, which is already in the figure, has run out. You can stop them at
            any point; the site does not switch off when you do.
          </p>
        ) : null}

        {pricingNotes?.map((note) => (
          <p key={note} className={styles.matrixNote}>
            {note}
          </p>
        ))}
      </Page>

      {/* every word explained */}
      <Page runner={ACTS.detail} folio={next()} {...shared}>
        <Heading
          eyebrow="No jargon"
          title="Every technical word in this document, in English."
          body="In grey, what the term actually means. In blue, the one sentence we would use to explain it out loud — because the two are not always the same thing."
          small
        />
        <div className={styles.glossary}>
          {glossary.map((entry) => (
            <div key={entry.term} className={styles.term}>
              <p className={styles.termName}>{entry.term}</p>
              <p className={styles.termPlain}>{entry.plain}</p>
              {entry.sayIt ? <p className={styles.termSay}>{entry.sayIt}</p> : null}
            </div>
          ))}
        </div>
      </Page>

      {/* how it gets paid for, and what happens next */}
      <Page runner={ACTS.detail} folio={next()} dark {...shared}>
        <Heading
          eyebrow="Paying for it"
          title="Three payments, and none of them is due before you have seen something."
          small
        />

        <div className={styles.schedule}>
          {schedule.map((instalment) => (
            <div key={instalment.label} className={styles.scheduleCard}>
              <p className={styles.scheduleLabel}>{instalment.label}</p>
              <p className={styles.scheduleAmount}>{instalment.amount}</p>
              <p className={styles.scheduleTrigger}>Due {instalment.trigger}.</p>
            </div>
          ))}
        </div>

        <ol className={styles.steps}>
          {nextSteps.map((step) => (
            <li key={step} className={styles.step}>
              <span className={styles.stepText}>{step}</span>
            </li>
          ))}
        </ol>

        <div className={styles.closer}>
          {signOff ? <p className={styles.closerLine}>&ldquo;{signOff}&rdquo;</p> : <span />}
          <p className={styles.closerContact}>
            {COMPANY_NAME}
            <br />
            {COMPANY_EMAIL}
            <br />
            {conceptUrl.replace(/^https?:\/\//, '')}
          </p>
        </div>
      </Page>
    </div>
  );
}
