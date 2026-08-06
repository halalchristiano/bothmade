'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import styles from './rigidized.module.css';
import { Swatch } from './RigidizedUI';
import {
  ALLOYS,
  APPLICATIONS,
  FINISHES,
  PATTERNS,
  alloyLabel,
  applicationLabel,
  finishLabel,
  patternBySlug,
  type AlloyKey,
  type ApplicationKey,
  type FinishKey,
} from './patterns';

/**
 * The selector.
 *
 * This is the entire argument of the concept in one screen. Their catalogue
 * is combinatorial — patterns times finishes times alloys times application —
 * and a page-based website can only ever express that as a list of pages. An
 * architect choosing a finish is not reading, they are filtering, and you
 * cannot filter a list of pages.
 *
 * Two things here do not exist anywhere on the current site and cannot: the
 * filters narrowing a live result set, and two patterns side by side.
 */

type Facet = 'alloy' | 'finish' | 'application';

export function PatternSelector() {
  const [alloys, setAlloys] = useState<AlloyKey[]>([]);
  const [finishes, setFinishes] = useState<FinishKey[]>([]);
  const [applications, setApplications] = useState<ApplicationKey[]>([]);
  const [compare, setCompare] = useState<string[]>([]);

  const toggle = <T extends string>(list: T[], set: (v: T[]) => void, value: T) => {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const results = useMemo(
    () =>
      PATTERNS.filter((p) => {
        if (alloys.length && !alloys.some((a) => p.alloys.includes(a))) return false;
        if (finishes.length && !finishes.some((f) => p.finishes.includes(f))) return false;
        if (applications.length && !applications.some((a) => p.applications.includes(a))) return false;
        return true;
      }),
    [alloys, finishes, applications]
  );

  const active = alloys.length + finishes.length + applications.length;

  const clearAll = () => {
    setAlloys([]);
    setFinishes([]);
    setApplications([]);
  };

  const toggleCompare = (slug: string) =>
    setCompare((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length >= 3 ? prev : [...prev, slug]
    );

  /* The alloy shown on each card follows the filter — pick brass and the
     whole grid warms up, which is the single most convincing half-second in
     the demo. */
  const previewAlloy: AlloyKey = alloys[0] ?? 'stainless';

  return (
    <>
      <div className={styles.selectorLayout}>
        <aside className={styles.filters}>
          <FacetGroup
            title="Alloy"
            options={ALLOYS.map((a) => ({ key: a.key, label: a.label, note: a.gauge }))}
            selected={alloys}
            onToggle={(v) => toggle(alloys, setAlloys, v as AlloyKey)}
          />
          <FacetGroup
            title="Finish"
            options={FINISHES.map((f) => ({ key: f.key, label: f.label, note: f.note }))}
            selected={finishes}
            onToggle={(v) => toggle(finishes, setFinishes, v as FinishKey)}
          />
          <FacetGroup
            title="Application"
            options={APPLICATIONS.map((a) => ({ key: a.key, label: a.label }))}
            selected={applications}
            onToggle={(v) => toggle(applications, setApplications, v as ApplicationKey)}
          />
        </aside>

        <div>
          <div className={styles.resultsBar}>
            <span className={styles.resultsCount}>
              <b>{results.length}</b> of {PATTERNS.length} patterns
              {active > 0 && ` · ${active} filter${active === 1 ? '' : 's'}`}
            </span>
            {active > 0 && (
              <button type="button" className={styles.clearBtn} onClick={clearAll}>
                Clear filters
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div className={styles.empty}>
              <p style={{ margin: '0 0 1rem' }}>Nothing matches that combination.</p>
              <button type="button" className={styles.clearBtn} onClick={clearAll}>
                Clear the filters
              </button>
            </div>
          ) : (
            <div className={`${styles.grid} ${styles.grid3}`}>
              {results.map((pattern) => {
                const alloy = pattern.alloys.includes(previewAlloy) ? previewAlloy : pattern.alloys[0];
                const inCompare = compare.includes(pattern.slug);
                return (
                  <div key={pattern.slug} className={styles.card}>
                    <Link href={`/rigidized/patterns/${pattern.slug}`}>
                      <Swatch pattern={pattern} alloy={alloy} className={styles.cardSwatch} />
                    </Link>
                    <div className={styles.cardBody}>
                      <Link href={`/rigidized/patterns/${pattern.slug}`}>
                        <span className={styles.cardName}>
                          {pattern.name}
                          {pattern.since && <span className={styles.badge}>{pattern.since}</span>}
                        </span>
                      </Link>
                      <div className={styles.cardMeta}>
                        {pattern.alloys.length} alloys · {pattern.finishes.length} finishes
                      </div>
                      <p className={styles.cardBlurb}>{pattern.blurb}</p>
                      <button
                        type="button"
                        onClick={() => toggleCompare(pattern.slug)}
                        className={styles.clearBtn}
                        style={{ marginTop: '0.85rem' }}
                        disabled={!inCompare && compare.length >= 3}
                      >
                        {inCompare ? '− Remove from comparison' : '+ Compare'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {compare.length > 0 && <ComparisonTable slugs={compare} onRemove={toggleCompare} />}
        </div>
      </div>

      {compare.length > 0 && (
        <div className={styles.compareBar}>
          <span style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--brass)' }}>
            Comparing
          </span>
          {compare.map((slug) => (
            <span key={slug} className={styles.compareChip}>
              {patternBySlug(slug)?.name}
              <button type="button" onClick={() => toggleCompare(slug)} aria-label="Remove">
                <X size={12} />
              </button>
            </span>
          ))}
          <button type="button" className={styles.clearBtn} onClick={() => setCompare([])} style={{ marginLeft: 'auto' }}>
            Clear
          </button>
        </div>
      )}
    </>
  );
}

function FacetGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ key: string; label: string; note?: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className={styles.filterGroup} style={{ border: 'none', margin: 0, padding: '1.1rem 0' }}>
      <legend className={styles.filterTitle} style={{ padding: 0 }}>{title}</legend>
      {options.map((o) => (
        <label key={o.key} className={styles.checkRow}>
          <input type="checkbox" checked={selected.includes(o.key)} onChange={() => onToggle(o.key)} />
          <span>
            {o.label}
            {o.note && <small>{o.note}</small>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function ComparisonTable({ slugs, onRemove }: { slugs: string[]; onRemove: (slug: string) => void }) {
  const patterns = slugs.map((s) => patternBySlug(s)!).filter(Boolean);

  return (
    <section style={{ marginTop: '3rem' }}>
      <h2 className={styles.h3}>Side by side</h2>
      <p style={{ fontSize: '0.86rem', color: 'var(--text-soft)', marginBottom: '1.5rem', maxWidth: '60ch' }}>
        The thing a catalogue of separate pages structurally cannot do — and the reason a specifier
        ends up with six browser tabs open.
      </p>
      <div style={{ overflowX: 'auto', border: '1px solid var(--line)' }}>
        <table className={styles.compareTable}>
          <tbody>
            <tr>
              <th />
              {patterns.map((p) => (
                <td key={p.slug} style={{ width: `${70 / patterns.length}%` }}>
                  <Swatch pattern={p} alloy={p.alloys[0]} className={styles.cardSwatch} />
                </td>
              ))}
            </tr>
            <tr>
              <th>Pattern</th>
              {patterns.map((p) => (
                <td key={p.slug}>
                  <strong>{p.name}</strong>
                  <button type="button" onClick={() => onRemove(p.slug)} className={styles.clearBtn} style={{ display: 'block', marginTop: '0.3rem' }}>
                    remove
                  </button>
                </td>
              ))}
            </tr>
            <tr>
              <th>Alloys</th>
              {patterns.map((p) => (
                <td key={p.slug}>{p.alloys.map(alloyLabel).join(', ')}</td>
              ))}
            </tr>
            <tr>
              <th>Finishes</th>
              {patterns.map((p) => (
                <td key={p.slug}>{p.finishes.map(finishLabel).join(', ')}</td>
              ))}
            </tr>
            <tr>
              <th>Applications</th>
              {patterns.map((p) => (
                <td key={p.slug}>{p.applications.map(applicationLabel).join(', ')}</td>
              ))}
            </tr>
            <tr>
              <th>Relative depth</th>
              {patterns.map((p) => (
                <td key={p.slug} style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
                  {'▮'.repeat(p.depth)}{'▯'.repeat(5 - p.depth)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
