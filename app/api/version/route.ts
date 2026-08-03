import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/middleware';

/**
 * Confirms what's actually deployed without needing the Vercel dashboard —
 * Vercel sets these env vars automatically at build time, nothing to configure.
 *
 * Staff-only. The full commit SHA and message were public: the message
 * routinely names the thing that just changed ("fix auth bypass on…"), which
 * is a map of where to look, and the SHA pins exactly which revision is
 * running. The unauthenticated response keeps only the environment name,
 * which is enough for a health check and tells an outsider nothing.
 */
export async function GET() {
  const session = await requireStaff();

  if (!session) {
    return NextResponse.json({ env: process.env.VERCEL_ENV || 'development' });
  }

  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    commitShort: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    env: process.env.VERCEL_ENV || 'development',
  });
}
