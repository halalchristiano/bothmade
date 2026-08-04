import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { sendMessageNotificationEmail } from '@/lib/email';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
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
