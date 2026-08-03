/**
 * Required-secret loading.
 *
 * Every secret this app signs or encrypts with used to have a hardcoded
 * fallback ('your-secret-key', 'your-session-secret', 'bothmade-dev-secret').
 * A deploy that forgot the env var didn't break — it silently ran on a
 * value published in this repo, which means anyone could mint a valid admin
 * JWT or decrypt a stored Gmail refresh token. There is no safe default for
 * a secret, so there is no default here: an unset secret is a hard error.
 *
 * `assertBootSecrets()` (called from instrumentation.ts) fails the server at
 * boot rather than on the first login attempt, so a misconfigured deploy is
 * obvious immediately instead of at 2am.
 */

/**
 * Values that were previously shipped as fallbacks, plus the usual
 * placeholders. Anyone who copies these out of the README into their env
 * has a secret that isn't secret, so reject them by name.
 */
const KNOWN_WEAK_SECRETS = new Set([
  'your-secret-key',
  'your-session-secret',
  'bothmade-dev-secret',
  'changeme',
  'change-me',
  'secret',
  'password',
  'development',
  'test',
]);

/** 32 chars ≈ 192 bits of base64 — comfortably past brute-forcing a JWT signature. */
const RECOMMENDED_SECRET_LENGTH = 32;

const HOW_TO_GENERATE = 'Generate one with: openssl rand -base64 48';

const cache = new Map<string, string>();
const warned = new Set<string>();

function loadSecret(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;

  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set. Refusing to start with an insecure default. ${HOW_TO_GENERATE}`);
  }
  if (KNOWN_WEAK_SECRETS.has(value.toLowerCase())) {
    throw new Error(
      `${name} is set to a known placeholder value ("${value}"). That string is public — it protects nothing. ${HOW_TO_GENERATE}`
    );
  }
  if (value.length < RECOMMENDED_SECRET_LENGTH && !warned.has(name)) {
    warned.add(name);
    console.warn(
      `[env] ${name} is only ${value.length} characters. At least ${RECOMMENDED_SECRET_LENGTH} is recommended. ${HOW_TO_GENERATE}`
    );
  }

  cache.set(name, value);
  return value;
}

/** Signs and verifies auth JWTs and the short-lived Gmail OAuth state. */
export function jwtSecret(): string {
  return loadSecret('JWT_SECRET');
}

/**
 * Reserved for session-layer signing. Kept required (rather than quietly
 * unused) because it is the legacy key material for anything encrypted
 * before GMAIL_ENCRYPTION_KEY existed — see lib/crypto.ts.
 */
export function sessionSecret(): string {
  return loadSecret('SESSION_SECRET');
}

/**
 * Encrypts Gmail app passwords and Google refresh tokens at rest.
 *
 * Deliberately separate from SESSION_SECRET: those two protect different
 * things with different blast radii, and rotating a session secret should
 * not silently make every stored mailbox credential undecryptable.
 *
 * Unlike the two above this is checked lazily rather than at boot, so a
 * deployment that never connects a mailbox isn't forced to invent a key it
 * won't use. The moment anything touches Gmail credentials it fails loudly.
 */
export function gmailEncryptionKey(): string {
  return loadSecret('GMAIL_ENCRYPTION_KEY');
}

/** Legacy key material for secrets encrypted before GMAIL_ENCRYPTION_KEY existed. */
export function legacyGmailEncryptionKey(): string | null {
  const value = process.env.SESSION_SECRET?.trim();
  return value ? value : null;
}

/**
 * Shared secret Vercel Cron signs its requests with. Cron routes fail closed
 * when this is missing, so it is required in production but optional locally
 * (where nothing is scheduling anything).
 */
export function cronSecret(): string | null {
  const value = process.env.CRON_SECRET?.trim();
  return value ? value : null;
}

/**
 * Fails the server at boot when a secret with no safe default is missing.
 * Called from instrumentation.ts.
 */
export function assertBootSecrets(): void {
  // Collected rather than thrown on the first failure. A deploy missing both
  // signing secrets should learn that in one go — otherwise you fix
  // JWT_SECRET, redeploy, and only then find out SESSION_SECRET was missing
  // too, which costs a second failed deploy at exactly the wrong moment.
  const failures: string[] = [];
  for (const load of [jwtSecret, sessionSecret]) {
    try {
      load();
    } catch (error) {
      failures.push((error as Error).message);
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join(' '));
  }

  const softChecks: Array<[string, string]> = [
    ['GMAIL_ENCRYPTION_KEY', 'Gmail app passwords and refresh tokens cannot be encrypted or read until this is set.'],
    ['CRON_SECRET', 'Scheduled jobs (/api/cron/*) will reject every request until this is set.'],
  ];

  for (const [name, consequence] of softChecks) {
    if (!process.env[name]?.trim()) {
      console.warn(`[env] ${name} is not set. ${consequence} ${HOW_TO_GENERATE}`);
    }
  }
}
