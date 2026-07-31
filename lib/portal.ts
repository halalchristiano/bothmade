import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Selection } from '@/lib/pricing';

/**
 * The client portal's identity layer.
 *
 * There are no passwords. A client's "login" is a signed link the studio mints
 * for them — the same mechanism Stripe, Figma, and every invoicing tool uses
 * for a document meant for exactly one person. The reasoning:
 *
 *   1. A password means a password reset flow, a hashing strategy, a session
 *      store, and a lockout policy. That is a real authentication system, and
 *      a half-built one is worse than none.
 *   2. Everything in the portal is already going to that client's inbox
 *      anyway. The link is no more secret than the email carrying it.
 *   3. The token carries the whole agreement inside it, signed. That means the
 *      portal needs no database to show a client the right scope and the right
 *      price — the link IS the record.
 *
 * What that buys: this ships today, on the studio's existing hosting, with one
 * environment variable. What it costs: anyone holding the link can open it, so
 * links expire, and anything genuinely sensitive (payment) still round-trips
 * through Stripe rather than living in here.
 */

/* ------------------------------------------------------------------ *
 * Build phases
 * ------------------------------------------------------------------ */

export type PhaseId =
  | 'onboarding'
  | 'deposit'
  | 'discovery'
  | 'design'
  | 'build'
  | 'review'
  | 'launch'
  | 'live';

export type Phase = {
  id: PhaseId;
  name: string;
  /** What the studio is doing. */
  studio: string;
  /** What the client owes us, if anything. Blank when the ball is ours. */
  client: string;
};

/**
 * The pipeline every project walks. Written so a client reading it alone, at
 * 11pm, knows exactly whose turn it is — the single most common thing clients
 * are anxious about and the single most common thing agencies leave vague.
 */
export const PHASES: Phase[] = [
  {
    id: 'onboarding',
    name: 'Onboarding',
    studio: 'Waiting on your answers before we can scope the work properly.',
    client: 'Fill in the onboarding form below. It is the long one — sorry — but every question in it is a decision we would otherwise have to guess at.',
  },
  {
    id: 'deposit',
    name: 'Deposit',
    studio: 'Holding your slot in the schedule.',
    client: 'Pay the deposit to start. We do not book time until it clears, which is the only reason your dates are not confirmed yet.',
  },
  {
    id: 'discovery',
    name: 'Discovery',
    studio: 'Reading everything you sent, auditing what exists, and writing the technical plan.',
    client: 'Nothing needed. We will come back with questions if we hit one.',
  },
  {
    id: 'design',
    name: 'Design',
    studio: 'Designing screens and building the design system.',
    client: 'One round of feedback when we share the first screens. Fast feedback here saves a week later.',
  },
  {
    id: 'build',
    name: 'Build',
    studio: 'Writing the actual thing. This is the longest phase and the quietest.',
    client: 'Nothing needed, but you will get a weekly update every week without asking.',
  },
  {
    id: 'review',
    name: 'Your review',
    studio: 'Everything is on a staging link for you to break.',
    client: 'Go through it properly and send everything at once. Scattered feedback over five days costs more than one thorough list.',
  },
  {
    id: 'launch',
    name: 'Launch',
    studio: 'Deploying, submitting to the App Store, pointing domains, final checks.',
    client: 'Final payment is due before launch. Any accounts we still need access to, we need now.',
  },
  {
    id: 'live',
    name: 'Live',
    studio: 'Shipped. Monitoring, and on hand for whatever comes up.',
    client: 'Nothing. Go and tell people about it.',
  },
];

export const getPhase = (id: PhaseId): Phase =>
  PHASES.find((p) => p.id === id) ?? PHASES[0];

export const phaseIndex = (id: PhaseId): number =>
  Math.max(0, PHASES.findIndex((p) => p.id === id));

/* ------------------------------------------------------------------ *
 * The token
 * ------------------------------------------------------------------ */

/** Everything the portal knows about a client, carried inside their link. */
export type PortalClient = {
  /** Schema version, so an old link can be rejected rather than misread. */
  v: 1;
  name: string;
  email: string;
  company?: string;
  /** What they configured on /start, or what the studio agreed on the call. */
  selection: Selection;
  phase: PhaseId;
  /** Percent of the total due up front. */
  depositPercent: number;
  /** Issued / expires, epoch ms. */
  iat: number;
  exp: number;
};

const b64url = {
  encode: (buf: Buffer | string): string =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (s: string): Buffer => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
};

/**
 * Refuses to fall back to a default when unset. A portal signed with a
 * guessable secret is worse than no portal, because it looks trustworthy.
 */
function secret(): string | null {
  const value = process.env.PORTAL_SECRET;
  return value && value.length >= 32 ? value : null;
}

export const portalConfigured = (): boolean => secret() !== null;

function sign(body: string, key: string): string {
  return b64url.encode(createHmac('sha256', key).update(body).digest());
}

/** Mints a client's link payload. Returns null if the portal isn't configured. */
export function mintToken(client: PortalClient): string | null {
  const key = secret();
  if (!key) return null;

  const body = b64url.encode(JSON.stringify(client));
  return `${body}.${sign(body, key)}`;
}

export type TokenResult =
  | { ok: true; client: PortalClient }
  | { ok: false; reason: 'unconfigured' | 'malformed' | 'bad-signature' | 'expired' };

/**
 * Verifies and decodes. Signature is checked before the payload is parsed and
 * before expiry is read — an attacker must not be able to influence anything
 * we do with the contents until we know we wrote them.
 */
export function readToken(token: string): TokenResult {
  const key = secret();
  if (!key) return { ok: false, reason: 'unconfigured' };

  const [body, mac] = token.split('.');
  if (!body || !mac) return { ok: false, reason: 'malformed' };

  const expected = Buffer.from(sign(body, key));
  const actual = Buffer.from(mac);

  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and the length itself is not a secret.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let client: PortalClient;
  try {
    client = JSON.parse(b64url.decode(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (client?.v !== 1 || !client.email || !client.selection) {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof client.exp !== 'number' || Date.now() > client.exp) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, client };
}

/** Six months is long enough for a build plus a warranty period. */
export const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 182;
