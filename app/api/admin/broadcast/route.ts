import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { sendMessageNotificationEmail } from '@/lib/email';

/** Broadcast a message to every active project's client thread — for announcements not specific to one client. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    // Equal admin (the owner's call, on main): every staff account may
    // broadcast, the same as every other messaging surface.

    const { content, segment = 'active' } = await request.json();
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    const projects = await prisma.project.findMany({
      where: segment === 'active' ? { status: { not: 'complete' } } : {},
      include: { client: { include: { emailPreferences: true } } },
    });

    await prisma.$transaction(
      projects.map((project) =>
        prisma.projectMessage.create({
          data: {
            projectId: project.id,
            content: content.trim(),
            isFromAdmin: true,
            userId: session.userId,
          },
        })
      )
    );

    const preview = content.trim().length > 100 ? content.trim().slice(0, 100) + '...' : content.trim();
    let emailsSent = 0;
    for (const project of projects) {
      if (project.client.emailPreferences?.notificationsEnabled && project.client.emailPreferences?.messages) {
        const sent = await sendMessageNotificationEmail(
          project.client.email,
          project.client.company,
          project.name,
          preview,
          project.id
        );
        if (sent) emailsSent += 1;
      }
    }

    return NextResponse.json(
      { success: true, projectsNotified: projects.length, emailsSent },
      { status: 200 }
    );
  } catch (error) {
    console.error('Broadcast error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
