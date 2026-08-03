import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { sendMessageNotificationEmail } from '@/lib/email';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const { content, attachments = [] } = await request.json();
    if (!content) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: (await params).projectId },
      include: { client: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const message = await prisma.projectMessage.create({
      data: {
        projectId: (await params).projectId,
        content,
        isFromAdmin: true,
        userId: session.userId,
        attachments: JSON.stringify(attachments),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const prefs = await prisma.emailPreferences.findUnique({
      where: { clientId: project.clientId },
    });

    if (prefs?.notificationsEnabled && prefs?.messages) {
      const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
      await sendMessageNotificationEmail(
        project.client.email,
        project.client.company,
        project.name,
        preview,
        project.id
      );
    }

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    console.error('Admin send message error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
