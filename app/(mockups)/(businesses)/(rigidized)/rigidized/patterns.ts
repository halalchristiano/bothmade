/**
 * The catalogue behind the concept.
 *
 * Every pattern name, alloy, finish and dimension in here is one we could
 * verify from Rigidized's own published pages, their data sheets, or their
 * listings on Material Bank and the architectural catalogues. Nothing is
 * invented.
 *
 * That matters more than it sounds. This gets shown to the people who make
 * the product — a fabricated pattern name would be spotted in the first ten
 * seconds and would undo everything the rest of the concept is trying to
 * prove. Their real catalogue runs to 25+ patterns and 15+ micro finishes;
 * eight patterns is enough to demonstrate the mechanism, and the banner on
 * the selector says so out loud rather than implying this is all of it.
 *
 * The textures are procedural CSS rather than photography for the same
 * reason: an abstract, obviously-generated swatch is honest about being a
 * placeholder. A stock photo of somebody else's metal would not be.
 */

export interface Pattern {
  slug: string;
  /** The trademarked name, as they write it. */
  name: string;
  /** One line, in the language an architect uses. */
  blurb: string;
  /** Introduced, where we know it. */
  since?: string;
  alloys: AlloyKey[];
  finishes: FinishKey[];
  applications: ApplicationKey[];
  /** Relative depth of the texture, 1–5. Drives the swatch rendering. */
  depth: number;
  /** Which procedural swatch to draw. */
  texture: TextureKey;
}

export type TextureKey =
  | 'raindrop'
  | 'raindrop-fine'
  | 'ribbed'
  | 'lattice'
  | 'stipple'
  | 'diamond'
  | 'hex'
  | 'hex-directional';

export const ALLOYS = [
  { key: 'stainless', label: 'Stainless steel', gauge: '0.018″ – 0.120″' },
  { key: 'aluminum', label: 'Aluminum', gauge: '0.008″ – 0.125″' },
  { key: 'brass', label: 'Brass', gauge: '0.008″ – 0.125″' },
  { key: 'bronze', label: 'Bronze', gauge: '0.008″ – 0.125″' },
] as const;
export type AlloyKey = (typeof ALLOYS)[number]['key'];

export const FINISHES = [
  { key: 'mill', label: 'Mill', note: 'As textured. The base finish.' },
  { key: 'highlighted', label: 'Highlighted', note: 'Raised surfaces polished back to catch light.' },
  { key: 'side-highlight', label: 'Side highlight', note: 'Directional polish along one axis.' },
  { key: 'non-prime-highlight', label: 'Non-prime highlight', note: 'Highlighted on the reverse face.' },
  { key: 'perforated', label: 'Perforated', note: 'Textured then perforated to an open pattern.' },
] as const;
export type FinishKey = (typeof FINISHES)[number]['key'];

export const APPLICATIONS = [
  { key: 'architectural-interior', label: 'Architectural — interior' },
  { key: 'architectural-exterior', label: 'Architectural — exterior' },
  { key: 'transportation', label: 'Transportation' },
  { key: 'industrial', label: 'Industrial' },
  { key: 'marine', label: 'Marine' },
] as const;
export type ApplicationKey = (typeof APPLICATIONS)[number]['key'];

export const SHEET_SIZES = {
  widths: ['36″', '48″', '60″'],
  lengths: ['96″', '120″', '144″'],
};

export const PATTERNS: Pattern[] = [
  {
    slug: '5wl',
    name: '5WL',
    blurb: 'The original. The pattern that defined textured metal when the company started texturing it.',
    since: '1940',
    alloys: ['stainless', 'aluminum', 'brass', 'bronze'],
    finishes: ['mill', 'highlighted', 'side-highlight'],
    applications: ['architectural-interior', 'architectural-exterior', 'industrial'],
    depth: 4,
    texture: 'raindrop',
  },
  {
    slug: '6wl',
    name: '6WL',
    blurb: 'The most specified pattern in the range — interior, exterior, transportation and marine.',
    alloys: ['stainless', 'aluminum', 'brass', 'bronze'],
    finishes: ['mill', 'highlighted', 'side-highlight', 'non-prime-highlight', 'perforated'],
    applications: ['architectural-interior', 'architectural-exterior', 'transportation', 'marine', 'industrial'],
    depth: 3,
    texture: 'raindrop-fine',
  },
  {
    slug: '2wl',
    name: '2WL',
    blurb: 'A tighter repeat for surfaces read at close range.',
    alloys: ['stainless', 'aluminum'],
    finishes: ['mill', 'highlighted'],
    applications: ['architectural-interior', 'industrial'],
    depth: 2,
    texture: 'ribbed',
  },
  {
    slug: '6sl',
    name: '6SL',
    blurb: 'Structural relief with a linear read — engineered for stiffness as much as surface.',
    alloys: ['stainless', 'aluminum'],
    finishes: ['mill', 'highlighted', 'side-highlight'],
    applications: ['industrial', 'transportation', 'architectural-exterior'],
    depth: 4,
    texture: 'lattice',
  },
  {
    slug: '1acc',
    name: '1ACC',
    blurb: 'A fine, even texture that hides handling marks on high-traffic surfaces.',
    alloys: ['stainless', 'aluminum', 'brass'],
    finishes: ['mill', 'highlighted'],
    applications: ['architectural-interior', 'transportation'],
    depth: 1,
    texture: 'stipple',
  },
  {
    slug: 'arlington',
    name: 'Arlington',
    blurb: 'A 6WL base, prime side, highlighted — specified where the surface has to carry a room.',
    alloys: ['stainless', 'brass', 'bronze'],
    finishes: ['highlighted'],
    applications: ['architectural-interior'],
    depth: 3,
    texture: 'diamond',
  },
  {
    slug: 'middlesex',
    name: 'Middlesex',
    blurb: 'A 6WL base, non-prime side highlight. Softer read under diffuse light.',
    alloys: ['stainless', 'aluminum', 'brass'],
    finishes: ['non-prime-highlight'],
    applications: ['architectural-interior', 'architectural-exterior'],
    depth: 3,
    texture: 'hex',
  },
  {
    slug: 'middlesex-td',
    name: 'Middlesex TD',
    blurb: 'Middlesex with a custom highlight. Made to a project specification.',
    alloys: ['stainless', 'brass', 'bronze'],
    finishes: ['non-prime-highlight', 'side-highlight'],
    applications: ['architectural-interior'],
    depth: 3,
    texture: 'hex-directional',
  },
];

/** Every document a specifier might need, per pattern. */
export interface SpecDocument {
  kind: 'data-sheet' | 'spec' | 'leed' | 'cad';
  label: string;
  /** Which alloy it covers, where that matters. */
  alloy?: AlloyKey;
  format: string;
}

export function documentsFor(pattern: Pattern): SpecDocument[] {
  const docs: SpecDocument[] = [
    { kind: 'data-sheet', label: `${pattern.name} data sheet`, format: 'PDF' },
  ];
  for (const alloy of pattern.alloys) {
    const alloyLabel = ALLOYS.find((a) => a.key === alloy)!.label;
    docs.push({
      kind: 'spec',
      label: `${pattern.name} ${alloyLabel} — 3-part architectural specification`,
      alloy,
      format: 'CSI MasterSpec · DOC',
    });
  }
  docs.push({ kind: 'leed', label: `${pattern.name} LEED documentation`, format: 'PDF' });
  docs.push({ kind: 'cad', label: `${pattern.name} CAD profile`, format: 'DWG · DXF' });
  return docs;
}

export function patternBySlug(slug: string): Pattern | undefined {
  return PATTERNS.find((p) => p.slug === slug);
}

/** Total combinations on offer, for the line the homepage opens with. */
export function combinationCount(): number {
  return PATTERNS.reduce((sum, p) => sum + p.alloys.length * p.finishes.length, 0);
}

export const alloyLabel = (key: AlloyKey) => ALLOYS.find((a) => a.key === key)?.label ?? key;
export const finishLabel = (key: FinishKey) => FINISHES.find((f) => f.key === key)?.label ?? key;
export const applicationLabel = (key: ApplicationKey) =>
  APPLICATIONS.find((a) => a.key === key)?.label ?? key;
