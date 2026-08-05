/**
 * What "good" looks like, agreed in writing before anyone designs anything.
 *
 * THE HOLE THIS FILLS. Requirements Sign-off under Section 5 fixes WHAT gets
 * built — features, pages, integrations. Nothing fixed how it should LOOK.
 * And Section 4 says acceptance is "limited to conformance with the written
 * scope, the signed-off requirements summary, Exhibit A, and any mutually
 * agreed specifications", with "subjective preferences not reflected in
 * agreed specifications" excluded as grounds for rejection.
 *
 * Read those together and there is a trap. With no visual direction agreed in
 * writing, EVERY aesthetic disagreement is by definition a subjective
 * preference — which is a win on paper and a loss in practice, because when
 * the studio genuinely misread the client, the contract still calls it the
 * client's preference and still spends one of their two rounds. The studio
 * then either eats a round it should not have charged, or argues for one it
 * cannot defend. Both are bad, and the second is worse.
 *
 * A signed direction closes it, using machinery the agreement already has.
 * Once there is something to compare the concept against:
 *
 *   Concept matches the signed direction, client dislikes it
 *     → preference. Spends a round. Correctly.
 *
 *   Concept departs from the signed direction
 *     → non-conformance under Section 4, and Exhibit C makes it "corrected at
 *       no charge and without counting against the revision allowance".
 *       Free, no round, our fault, recorded as such. Correctly.
 *
 * It converts "I misunderstood what they wanted" from an argument into a
 * category. No new clause is needed — what was missing was the artefact the
 * existing clause is meant to be measured against.
 *
 * DELIBERATELY SHORT. Ten minutes of a client's time, structured enough to
 * judge conformance against. A questionnaire long enough to be thorough is a
 * questionnaire a good number of clients never finish, and an unfinished
 * brief protects nobody.
 */

import { FIELD_LIMITS } from '@/lib/validation';

export const MAX_REFERENCES = 5;
export const MIN_REFERENCES = 2;
export const MAX_ADJECTIVES = 3;

const MAX_URL = 300;
const MAX_WHY = 500;
const MAX_TEXT = 2000;
const MAX_ADJECTIVE = 40;

export interface DirectionReference {
  url: string;
  /** The half that matters. A link with no reason is a link we have to guess at. */
  why: string;
}

export interface DesignDirectionDraft {
  likes: DirectionReference[];
  dislikes: DirectionReference[];
  adjectives: string[];
  untouchable: string | null;
  hardNos: string | null;
  notes: string | null;
}

export interface DirectionRead {
  ok: boolean;
  error?: string;
  draft?: DesignDirectionDraft;
}

/**
 * The questions, and why each one is asked.
 *
 * The `why` text is shown to the client. A form that explains what it is for
 * gets better answers than one that just demands them — particularly the
 * reason field, which people skip unless told it is the important half.
 */
export const DIRECTION_PROMPTS = {
  likes: {
    label: 'Sites you like',
    help: "Two to five, and tell us what you like about each — 'clean', 'the way the photos are used', 'how simple the menu is'. The reason matters far more than the link: two people can send the same site meaning opposite things.",
  },
  dislikes: {
    label: "Sites you don't like",
    help: "Just as useful, often more. If there's something you'd hate us to do, this is where to say it.",
  },
  adjectives: {
    label: 'Three words',
    help: "How should the site feel to someone landing on it? e.g. 'calm, professional, warm' or 'bold, modern, confident'.",
  },
  untouchable: {
    label: "Anything we mustn't change",
    help: 'Logo, brand colours, a typeface, an existing photo library — anything already fixed that the design has to work around.',
  },
  hardNos: {
    label: 'Hard no’s',
    help: "Anything that's off the table. Colours, styles, stock photography, animation — whatever you know you don't want.",
  },
} as const;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Tidy a reference into something that will actually open.
 *
 * Bare domains are what people type, so a bare domain becomes https rather
 * than being rejected — the same reasoning as lib/deliverables.ts. Anything
 * that is not a link at all is kept as written: "the brochure you sent me"
 * is a legitimate reference and refusing it would lose the answer.
 */
export function normalizeReferenceUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, MAX_URL);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(trimmed) && !/\s/.test(trimmed)) {
    return `https://${trimmed}`.slice(0, MAX_URL);
  }
  return trimmed.slice(0, MAX_URL);
}

function readReferences(input: unknown, max: number): DirectionReference[] {
  if (!Array.isArray(input)) return [];
  const out: DirectionReference[] = [];
  for (const raw of input.slice(0, max)) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const url = cleanText(row.url, MAX_URL);
    const why = cleanText(row.why, MAX_WHY);
    // A row with neither is an empty row somebody added and left. Dropping it
    // silently beats refusing the whole brief over it.
    if (!url && !why) continue;
    if (!url) continue;
    out.push({ url: normalizeReferenceUrl(url), why: why ?? '' });
  }
  return out;
}

export function readDirectionDraft(input: unknown): DirectionRead {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Nothing was submitted.' };
  }
  const body = input as Record<string, unknown>;

  const likes = readReferences(body.likes, MAX_REFERENCES);
  const dislikes = readReferences(body.dislikes, MAX_REFERENCES);

  const adjectives = (Array.isArray(body.adjectives) ? body.adjectives : [])
    .map((a) => cleanText(a, MAX_ADJECTIVE))
    .filter((a): a is string => Boolean(a))
    .slice(0, MAX_ADJECTIVES);

  /**
   * Two references and three words is the floor.
   *
   * Not arbitrary: it is the least that can be measured against. One
   * reference tells us a client liked one site, which is indistinguishable
   * from a client who clicked the first link they found; two with reasons
   * shows a direction. The words catch the case where both references are
   * the same idea.
   */
  if (likes.length < MIN_REFERENCES) {
    return {
      ok: false,
      error: `Give us at least ${MIN_REFERENCES} sites you like — one on its own doesn't tell us where you're heading.`,
    };
  }
  if (likes.some((l) => !l.why)) {
    return {
      ok: false,
      error: "Tell us what you like about each one. The reason is the part we design from — the link on its own we'd only be guessing at.",
    };
  }
  if (adjectives.length < MAX_ADJECTIVES) {
    return { ok: false, error: 'Give us all three words — they settle it when two of your references disagree.' };
  }

  return {
    ok: true,
    draft: {
      likes,
      dislikes,
      adjectives,
      untouchable: cleanText(body.untouchable, MAX_TEXT),
      hardNos: cleanText(body.hardNos, MAX_TEXT),
      notes: cleanText(body.notes, MAX_TEXT),
    },
  };
}

/**
 * The sentence beside the checkbox, served by the server and stored verbatim.
 *
 * Same reasoning as every other clickwrap here: what the record says they
 * agreed to comes from this constant, not from a string the browser posted,
 * so a crafted request cannot put words in anybody's mouth.
 *
 * It names the consequence in both directions, because a signature is only
 * worth having if the signer understood what it bought them. It buys the
 * client the right to call a departure from this brief a mistake we fix free;
 * it buys the studio the right to call a change of mind a revision.
 */
export const DIRECTION_STATEMENT =
  'This is the design direction for my project. I understand the first design will be ' +
  'built to it: if what we present departs from what I have written here, that is our ' +
  'mistake to correct at no charge, and if I simply change my mind about the direction ' +
  'itself, that is one of the revision rounds included in my project. Typing my full ' +
  'name is my electronic signature on this brief.';

export const SIGNER_NAME_MAX = FIELD_LIMITS.name;

/**
 * Is a design safe to present?
 *
 * A warning rather than a gate, by choice. Blocking would stop work on a
 * client who is simply slow to fill in a form, which costs more than it
 * saves — but presenting without one should never be something that happens
 * silently, because the moment it does the studio has given up the only
 * evidence that would settle a "that's not what I asked for" argument.
 */
export interface DirectionStatus {
  exists: boolean;
  signed: boolean;
  /** Said on the project page, right beside the button that presents a design. */
  warning: string | null;
}

export function directionStatus(direction: { signedAt: Date | null } | null): DirectionStatus {
  if (!direction) {
    return {
      exists: false,
      signed: false,
      warning:
        "No design direction on file. You can present anyway, but nothing is written down about how this should look — so if they say it isn't what they wanted, there's nothing to measure that against and it comes out of their revision rounds either way.",
    };
  }
  if (!direction.signedAt) {
    return {
      exists: true,
      signed: false,
      warning:
        "The design direction has been sent but they haven't signed it. Worth chasing before you present — an unsigned brief settles nothing if it's ever argued about.",
    };
  }
  return { exists: true, signed: true, warning: null };
}
