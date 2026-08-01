import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'client') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get email preferences for this client
    const preferences = await prisma.emailPreferences.findUnique({
      where: { clientId: session.clientId },
    });

    if (!preferences) {
      return NextResponse.json(
        { error: 'Email preferences not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, preferences },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get email preferences error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'client') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const {
      notificationsEnabled,
      digestFrequency,
      statusUpdates,
      messages,
    } = await request.json();

    const preferences = await prisma.emailPreferences.update({
      where: { clientId: session.clientId },
      data: {
        notificationsEnabled:
          notificationsEnabled !== undefined
            ? notificationsEnabled
            : undefined,
        digestFrequency: digestFrequency || undefined,
        statusUpdates: statusUpdates !== undefined ? statusUpdates : undefined,
        messages: messages !== undefined ? messages : undefined,
      },
    });

    return NextResponse.json(
      { success: true, preferences },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update email preferences error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
