/**
 * Client testimonials and social proof.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  EMPTY ON PURPOSE
 *
 *  Same rule as /work and the blog: we'd rather show nothing than show
 *  something invented. No stock headshots, no "Sarah M., CEO", no
 *  paraphrased praise nobody actually said.
 *
 *  Add a row here only when a real client has said the words and agreed to
 *  be quoted. `<SocialProof />` renders nothing at all while this list is
 *  empty, so the homepage stays honest until there's something true to put
 *  on it — and gains a testimonial section the moment there is.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Testimonial = {
  /** Their words, verbatim. Trim for length, never rewrite for polish. */
  quote: string;
  name: string;
  /** Job title — "Founder", "Head of Ops". */
  role: string;
  company: string;
  /** What we built for them, e.g. "Website + booking system". */
  project?: string;
  /** Optional link to the live product or its case study. */
  href?: string;
};

export const TESTIMONIALS: Testimonial[] = [];

/**
 * Countable proof points — shipped projects, App Store releases, years
 * running. Also empty on purpose: a "0 projects delivered" tile is worse
 * than no tile, and an inflated one is worse than both.
 */
export type ProofStat = { value: string; label: string };

export const PROOF_STATS: ProofStat[] = [];

export const hasSocialProof = TESTIMONIALS.length > 0 || PROOF_STATS.length > 0;
