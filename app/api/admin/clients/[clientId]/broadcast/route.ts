import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { sendMessageNotificationEmail } from '@/lib/email';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { content } = await request.json();
    if (!content) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    const client = await prisma.client.findUnique({
      where: { id: (await params).clientId },
      include: { projects: true, emailPreferences: true },
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    await prisma.$transaction(
      client.projects.map((project) =>
        prisma.projectMessage.create({
          data: {
            projectId: project.id,
            content,
            isFromAdmin: true,
            userId: session.userId,
          },
        })
      )
    );

    if (
      client.emailPreferences?.notificationsEnabled &&
      client.emailPreferences?.messages &&
      client.projects.length > 0
    ) {
      // One email per broadcast, not one per project — the same message posted
      // to every thread shouldn't land in the client's inbox N times. Deep-link
      // the first project; the others carry the identical message.
      const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
      const primary = client.projects[0];
      await sendMessageNotificationEmail(
        client.email,
        client.company,
        primary.name,
        preview,
        primary.id
      );
    }

    return NextResponse.json(
      { success: true, projectsNotified: client.projects.length },
      { status: 200 }
    );
  } catch (error) {
    console.error('Broadcast message error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
