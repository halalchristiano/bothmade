import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { buildSignUrl } from '@/lib/share-links';

/**
 * Revoke a public share link by replacing its capability token.
 *
 * The point of separating the token from the record's cuid was that a link
 * could then be revoked without touching the record — but "rotate the
 * column" is only a real capability if something can actually do it. This
 * is that something.
 *
 * Every previously sent link for the target stops working immediately: a
 * proposal forwarded to the wrong address, a status page shared with a
 * client's contractor who has since left, a lead who went cold and shouldn't
 * still be able to open a priced contract. The new link is returned so
 * whoever rotated it can send the replacement.
 *
 * Staff-only, and not owner-only: revoking access is the safe direction, and
 * a rep who realises they misaddressed an email should not have to wait.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }

    const { type, id } = (body ?? {}) as { type?: unknown; id?: unknown };

    if ((type !== 'lead' && type !== 'project') || typeof id !== 'string' || !id) {
      return NextResponse.json(
        { error: "Send { type: 'lead' | 'project', id: string }" },
        { status: 400 }
      );
    }

    const shareToken = crypto.randomBytes(32).toString('hex');

    if (type === 'lead') {
      const lead = await prisma.lead
        .update({ where: { id }, data: { shareToken }, select: { id: true, company: true } })
        .catch(() => null);
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

      // Worth a timeline entry: "the client says the link is dead" has an
      // answer other than guessing.
      await prisma.leadActivity
        .create({
          data: {
            leadId: lead.id,
            type: 'note',
            content: 'Sign-and-pay link rotated — every previously sent link for this lead no longer opens.',
            createdById: session.userId,
          },
        })
        .catch(() => null);

      return NextResponse.json(
        { success: true, shareToken, url: buildSignUrl(lead.id, shareToken) },
        { status: 200 }
      );
    }

    const project = await prisma.project
      .update({ where: { id }, data: { shareToken }, select: { id: true } })
      .catch(() => null);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    return NextResponse.json({ success: true, shareToken }, { status: 200 });
  } catch (error) {
    console.error('Rotate share link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
