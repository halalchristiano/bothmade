import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, avatarUrl: true, title: true },
    });

    return NextResponse.json(
      { name: user?.name || '', avatarUrl: user?.avatarUrl || null, title: user?.title || '' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Room for a real name, and nothing like enough for a payload. */
const NAME_MAX = 120;
const TITLE_MAX = 120;
/** A Blob URL is well under this; the cap is a typo guard, not a policy. */
const AVATAR_URL_MAX = 2048;

/**
 * Where a headshot may point.
 *
 * The upload route beside this one is careful: it mints a Blob token for a
 * short list of image types under a size cap, precisely so nobody can park
 * an HTML or SVG file on our storage domain. Then this route stored whatever
 * string arrived, which made all of that decoration — the browser never has
 * to use the upload at all, it can just PATCH a URL.
 *
 * What that bought an attacker is small but real, and it is aimed inward: an
 * avatar renders as an <img> on pages other members of the studio open, so an
 * off-site URL turns every teammate's page view into a request to somebody
 * else's server, carrying their address and the time they were working. A
 * `javascript:` string is inert in `src` today and is one refactor away from
 * being somewhere it is not.
 *
 * So: https only, and only a host we actually serve images from. Relative
 * paths are allowed because that is what a bundled default looks like.
 */
function cleanAvatarUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > AVATAR_URL_MAX) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    /*
     * Vercel Blob is where avatar-upload puts them; anything else is either a
     * mistake or somebody else's server.
     *
     * Matched on the storage domain rather than the exact store hostname,
     * which has changed shape before (`<id>.public.blob.vercel-storage.com`).
     * Pinning the whole host would mean an avatar upload that silently starts
     * failing the day Vercel adjusts it, and the point here is to exclude
     * third-party hosts, not to guess a subdomain.
     */
    if (!parsed.hostname.endsWith('.vercel-storage.com')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { name, avatarUrl, title } = await request.json();

    const data: { name?: string; avatarUrl?: string | null; title?: string | null } = {};
    if (typeof name === 'string') {
      if (!name.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      data.name = name.trim().slice(0, NAME_MAX);
    }
    if (avatarUrl === null) {
      // Explicitly clearing the headshot.
      data.avatarUrl = null;
    } else if (typeof avatarUrl === 'string') {
      const clean = cleanAvatarUrl(avatarUrl);
      // An empty string means "remove it", which is what the page sends when
      // somebody deletes their picture.
      if (!clean && avatarUrl.trim()) {
        return NextResponse.json(
          { error: 'That is not a picture we uploaded. Choose a file instead of pasting a link.' },
          { status: 400 }
        );
      }
      data.avatarUrl = clean;
    }
    if (typeof title === 'string') {
      data.title = title.trim().slice(0, TITLE_MAX) || null;
    }
    await prisma.user.update({ where: { id: session.userId }, data });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
