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
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
