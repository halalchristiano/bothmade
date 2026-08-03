import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readShareToken, shareTokenMatches } from '@/lib/share-links';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';

/**
 * Public (no login) — read-only status snapshot a client can forward to
 * their own team. Access is the capability token in the link, not the
 * project's cuid: the cuid is in the client's own dashboard URL, in every
 * admin URL, and in notification emails, so treating it as a secret meant
 * this page was effectively open to anyone who'd seen one. Deliberately
 * excludes anything internal or financial (messages, payments, pricing) so
 * a forwarded link doesn't leak more than "here's where things stand."
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const limited = await enforceRateLimit(
      request,
      'public-status',
      RATE_LIMITS.publicRead,
      'Too many requests. Please wait a moment and reload.'
    );
    if (limited) return limited;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { company: true } },
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, title: true, description: true, createdAt: true },
        },
      },
    });

    // Same 404 either way — a wrong token must not confirm the ID is real.
    if (!project || !shareTokenMatches(project.shareToken, readShareToken(request))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        project: {
          name: project.name,
          company: project.client.company,
          statusStage: project.statusStage,
          estimatedCompletionDate: project.estimatedCompletionDate,
          updates: project.updates,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get public project status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
