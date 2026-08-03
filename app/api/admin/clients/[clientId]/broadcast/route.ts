import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { sendMessageNotificationEmail } from '@/lib/email';
import { alertEmailDeliveryFailure } from '@/lib/notify';

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

    // The message is posted into every project thread, but it is one
    // message to one person. Emailing per project meant a client with four
    // active projects got four identical emails within a second of each
    // other, which reads as a broken system and trains them to filter us.
    // One email, pointed at the most recently created project.
    if (
      client.emailPreferences?.notificationsEnabled &&
      client.emailPreferences?.messages &&
      client.projects.length > 0
    ) {
      const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
      const newest = [...client.projects].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0];
      const subjectProject =
        client.projects.length === 1
          ? newest.name
          : `${newest.name} and ${client.projects.length - 1} other project${
              client.projects.length === 2 ? '' : 's'
            }`;

      const sent = await sendMessageNotificationEmail(
        client.email,
        client.company,
        subjectProject,
        preview,
        newest.id
      );
      if (!sent) {
        await alertEmailDeliveryFailure({
          kind: 'client broadcast notification',
          recipient: client.email,
          context: { company: client.company, projects: client.projects.length, preview },
        });
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
