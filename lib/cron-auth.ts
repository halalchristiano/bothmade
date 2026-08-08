import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { cronSecret } from '@/lib/env';

/**
 * Guard for the /api/cron/* routes.
 *
 * The old check was `if (process.env.CRON_SECRET && header !== ...)` — the
 * secret being unset made the route *public*, which is exactly backwards.
 * These endpoints send mail to every lead's rep and scan connected Gmail
 * mailboxes; an unauthenticated caller can fire them in a loop. A missing
 * secret means we cannot tell Vercel Cron apart from anyone else, so the
 * only safe answer is no.
 */
export function requireCronAuth(request: Request): NextResponse | null {
  const secret = cronSecret();

  if (!secret) {
    console.error('[cron] CRON_SECRET is not set — refusing to run a scheduled job.');
    return NextResponse.json(
      { error: 'Scheduled jobs are not configured on this deployment.' },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!matchesSecret(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * Constant-time comparison of the Authorization header against the expected
 * value.
 *
 * This was `authHeader !== \`Bearer ${secret}\``. String `!==` returns at the
 * first differing byte, so how long it takes is a function of how many
 * leading characters were right — which is a signal about the secret,
 * measured from outside.
 *
 * Being straight about the size of this: over the public internet, against a
 * serverless function, that signal is buried under network jitter and cold
 * starts by orders of magnitude. Nobody is realistically extracting
 * CRON_SECRET this way. The reason to change it is not the attack — it is
 * that the other two secret comparisons in this codebase already use
 * `timingSafeEqual` (`bootstrapTokenMatches` in the signup route,
 * `lib/share-links.ts`), and a codebase where the safe pattern is used in
 * two of three places teaches the wrong lesson at the third. Consistency is
 * the point; the timing property is a free side effect.
 *
 * `timingSafeEqual` throws on unequal lengths, so the length check has to
 * come first — and that check is not itself constant-time. It leaks the
 * length of the expected value, which is not a secret worth protecting.
 */
function matchesSecret(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
