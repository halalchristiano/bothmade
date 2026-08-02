import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { requireRole, OPS } from '@/lib/authz';
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
    const denied = requireRole(session, OPS);
    if (denied) return denied;

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

    if (client.emailPreferences?.notificationsEnabled && client.emailPreferences?.messages) {
      const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
      for (const project of client.projects) {
        await sendMessageNotificationEmail(
          client.email,
          client.company,
          project.name,
          preview,
          project.id
        );
      }
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
