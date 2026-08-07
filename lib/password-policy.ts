/**
 * One password policy, applied everywhere a password is set: admin signup,
 * the password-reset completion, admin settings, and client settings. Before
 * this, "at least 8 characters" was enforced on exactly one of those four,
 * which meant a reset link could set a staff password to `a`.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200; // bcrypt only reads the first 72 bytes; reject the rest rather than silently truncating

/**
 * How long a password-reset link stays alive.
 *
 * Here, and exported, because two places have to agree about it and did not:
 * the route minted a one-hour token while the email told the recipient the
 * link "expires in 24 hours". Anyone who read that sentence and came back to
 * it after lunch met "Invalid or expired token" — a dead end that looks like
 * the reset is broken rather than like the link is simply old, and the sort
 * of thing people retry three times before writing in.
 *
 * One hour is the right number to keep: a reset link is used within minutes
 * or not at all, and a link sitting live in an inbox overnight is a standing
 * key to the account. So the email now reads its wording from here.
 */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** The same span in words, for the one sentence that has to state it. */
export const RESET_TOKEN_TTL_LABEL = 'one hour';

// Not a real breach list — that belongs in a file, not in code. This is the
// short set that shows up in practice on small teams' accounts, plus the
// obvious app-specific ones.
const BANNED = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwertyuiop',
  'qwerty123',
  '123456789012',
  '1234567890123',
  'letmein12345',
  'iloveyou1234',
  'administrator',
  'bothmade',
  'bothmade123',
  'bothmadestudio',
  'welcome12345',
  'changeme1234',
]);

export interface PasswordCheck {
  ok: boolean;
  error?: string;
}

/**
 * `identity` is the account's email (or company name) — a password that
 * contains it is guessable by anyone who knows who the account belongs to,
 * which for a client portal is everyone we emailed the link to.
 */
export function checkPasswordStrength(password: unknown, identity?: string | null): PasswordCheck {
  if (typeof password !== 'string') {
    return { ok: false, error: 'Password is required.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.` };
  }
  if (password.trim().length !== password.length) {
    return { ok: false, error: 'Password cannot start or end with a space.' };
  }

  const normalized = password.toLowerCase();

  if (BANNED.has(normalized)) {
    return { ok: false, error: 'That password is too common. Pick something harder to guess.' };
  }

  // A single repeated character or a straight run off the keyboard clears a
  // length check without being any harder to guess than a short password.
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, error: 'Password cannot be a single repeated character.' };
  }
  if (/^(?:0123456789|1234567890|abcdefghij)/.test(normalized)) {
    return { ok: false, error: 'That password is too predictable. Pick something harder to guess.' };
  }

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) {
    return {
      ok: false,
      error: 'Password must include at least three of: lowercase, uppercase, numbers, symbols.',
    };
  }

  if (identity) {
    const localPart = identity.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (localPart && localPart.length >= 4 && normalized.replace(/[^a-z0-9]/g, '').includes(localPart)) {
      return { ok: false, error: 'Password cannot contain your email address or company name.' };
    }
  }

  return { ok: true };
}
