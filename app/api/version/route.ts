import { NextResponse } from 'next/server';

/**
 * Confirms what's actually deployed without needing the Vercel dashboard —
 * Vercel sets these env vars automatically at build time, nothing to configure.
 */
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    commitShort: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    env: process.env.VERCEL_ENV || 'development',
  });
}
