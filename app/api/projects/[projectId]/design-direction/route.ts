import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requirePrincipal } from '@/lib/middleware';
import {
  DIRECTION_STATEMENT,
  directionStatus,
  readDirectionDraft,
} from '@/lib/design-direction';
import { normalizeSignerName, USER_AGENT_MAX } from '@/lib/clickwrap';
import { notifyAdminsDesignDirectionSigned } from '@/lib/notify';
import { sendDesignDirectionSignedEmail } from '@/lib/email';
import { resolveSiteUrl } from '@/lib/site-url';

/**
 * The design direction brief: written by the client, signed by the client.
 *
 * Why it exists at all is in lib/design-direction.ts. In short: Section 5's
 * Requirements Sign-off fixes what gets built and nothing fixed how it should
 * look, so with no brief on record every aesthetic disagreement is a
 * "subjective preference" under Section 4 — including the ones that were
 * genuinely the studio's misreading, which then wrongly spend one of the
 * client's two revision rounds.
 *
 * Signed rather than merely saved, and signed with the same evidence as the
 * contract itself: the statement is served from a constant here, hashed, and
 * stored beside the name, IP and user agent. What the record says they agreed
 * to comes from the server, never from the browser.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;

    const { projectId } = await params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, designDirection: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return forbiddenResponse();
    }

    return NextResponse.json(
      {
        success: true,
        direction: project.designDirection,
        status: directionStatus(project.designDirection),
        statement: DIRECTION_STATEMENT,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get design direction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Save the brief, and sign it if a name was typed.
 *
 * One endpoint for both because they are one action from the client's side —
 * they fill it in and press the button. Saving without signing is supported
 * so a half-finished brief survives a closed tab, but nothing is signed
 * without an affirmative act.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;

    const { projectId } = await params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        status: true,
        clientId: true,
        designDirection: { select: { id: true, signedAt: true } },
        client: { select: { email: true, company: true, contactName: true } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return forbiddenResponse();
    }

    /**
     * Signed is signed.
     *
     * The whole value of this record is that it fixes what was agreed BEFORE
     * the design existed. A brief that can be rewritten after seeing the
     * concept is not evidence of anything — it is a way to retrofit the
     * argument you wish you had made. A genuine change of direction after
     * signing is exactly what the revision rounds are for.
     */
    if (project.designDirection?.signedAt) {
      return NextResponse.json(
        {
          error:
            "You've already signed this brief. If your thinking has moved on, tell us in a message — we'd rather hear it than have you edit it after the fact.",
        },
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const read = readDirectionDraft(body);
    if (!read.ok || !read.draft) {
      return NextResponse.json({ error: read.error ?? 'Nothing was submitted.' }, { status: 400 });
    }

    const signerName = normalizeSignerName(body?.signerName);
    const wantsToSign = body?.sign === true;
    if (wantsToSign && !signerName) {
      return NextResponse.json(
        { error: 'Type your full name to sign it.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const { likes, dislikes, adjectives, untouchable, hardNos, notes } = read.draft;

    const signature = wantsToSign
      ? {
          signedAt: now,
          signerName,
          signerEmail: project.client.email,
          // Behind Vercel's proxy the first hop is the client. Best effort:
          // an absent header is recorded as absent rather than as a guess.
          signerIp:
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            null,
          signerUserAgent: (request.headers.get('user-agent') ?? '').slice(0, USER_AGENT_MAX) || null,
          // The statement we SERVED, hashed. A later reword of the page
          // cannot retroactively change what this signature claims.
          signedStatement: DIRECTION_STATEMENT,
          signedHash: createHash('sha256').update(DIRECTION_STATEMENT).digest('hex'),
        }
      : {};

    const data = {
      likes: likes as unknown as object[],
      dislikes: dislikes as unknown as object[],
      adjectives: adjectives as unknown as object[],
      untouchable,
      hardNos,
      notes,
      ...signature,
    };

    const direction = await prisma.designDirection.upsert({
      where: { projectId },
      update: data,
      create: { projectId, ...data },
    });

    if (wantsToSign) {
      await prisma.projectUpdate
        .create({
          data: {
            projectId,
            title: 'Design direction agreed',
            description:
              "Thanks — that's the brief we'll design to. If what we present doesn't match it, that's ours to put right at no charge; if you change your mind about the direction itself, that's one of your included revision rounds. Either way, tell us.",
            statusStage: project.status,
            userId: null,
          },
        })
        .catch((error) => console.error(`Direction timeline entry failed for ${projectId}:`, error));

      await notifyAdminsDesignDirectionSigned({
        projectId,
        projectName: project.name,
        company: project.client.company,
        adjectives,
        likeCount: likes.length,
        dislikeCount: dislikes.length,
      }).catch((error) => console.error(`Direction notify failed for ${projectId}:`, error));

      /*
       * Their copy of what they just signed.
       *
       * The timeline entry above tells them it landed, but only inside the
       * dashboard — and this brief is the standard the work gets measured
       * against. "If what we present doesn't match it, that's ours to put
       * right at no charge" is a promise the client can only hold us to if
       * they are actually holding the brief; the version they have to log in
       * and go looking for is not that.
       *
       * Not gated on the statusUpdates preference: this is a signed record,
       * the same class of mail as a countersigned agreement, not an update
       * about progress.
       */
      if (project.client.email) {
        await sendDesignDirectionSignedEmail({
          toEmail: project.client.email,
          contactName: project.client.contactName,
          projectName: project.name,
          adjectives,
          likeCount: likes.length,
          dislikeCount: dislikes.length,
          notes: notes || null,
          signedOnLabel: now.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          dashboardUrl: `${resolveSiteUrl()}/client/${projectId}`,
        }).catch((error) =>
          console.error(`Direction client copy failed for ${projectId}:`, error)
        );
      }
    }

    return NextResponse.json(
      { success: true, direction, status: directionStatus(direction) },
      { status: 200 }
    );
  } catch (error) {
    console.error('Save design direction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
