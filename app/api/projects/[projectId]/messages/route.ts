import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePrincipal } from '@/lib/middleware';
import { sendMessageNotificationEmail } from '@/lib/email';
import { notifyAdminsNewClientMessage } from '@/lib/notify';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;

    const { projectId } = await params;

    // Verify project exists and user has access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check authorization
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const messages = await prisma.projectMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        client: {
          select: { id: true, email: true, company: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, messages },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;

    const { projectId } = await params;
    const { content, attachments = [] } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check authorization
    if (session.type === 'client' && project.clientId !== session.clientId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Create message
    const message = await prisma.projectMessage.create({
      data: {
        projectId,
        content,
        isFromAdmin: session.type === 'user',
        userId: session.type === 'user' ? session.userId : undefined,
        clientId: session.type === 'client' ? session.clientId : undefined,
        attachments: JSON.stringify(attachments),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        client: {
          select: { id: true, email: true, company: true },
        },
      },
    });

    // Send notification email if from admin to client
    if (session.type === 'user' && project.client) {
      const prefs = await prisma.emailPreferences.findUnique({
        where: { clientId: project.clientId },
      });

      if (prefs?.notificationsEnabled && prefs?.messages) {
        const preview =
          content.length > 100
            ? content.substring(0, 100) + '...'
            : content;

        await sendMessageNotificationEmail(
          project.client.email,
          project.client.company,
          project.name,
          preview,
          projectId
        );
      }
    }

    // Send notification email to the team if from client to admin
    if (session.type === 'client' && project.client) {
      const preview =
        content.length > 100 ? content.substring(0, 100) + '...' : content;

      await notifyAdminsNewClientMessage({
        projectId,
        projectName: project.name,
        clientCompany: project.client.company,
        preview,
      });
    }

    return NextResponse.json(
      { success: true, message },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create message error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
