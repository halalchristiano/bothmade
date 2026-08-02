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

    // A client without a preferences row (imported, or a failed create) should
    // see the defaults, not a 404 that breaks the settings screen.
    return NextResponse.json(
      {
        success: true,
        preferences: preferences ?? {
          clientId: session.clientId,
          notificationsEnabled: true,
          digestFrequency: 'daily',
          statusUpdates: true,
          messages: true,
        },
      },
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

    // Upsert, not update: a client whose preferences row was never created
    // (imported client, or a failed create at signup) would otherwise get a
    // 500 (P2025) the moment they touch this screen.
    const preferences = await prisma.emailPreferences.upsert({
      where: { clientId: session.clientId },
      update: {
        notificationsEnabled:
          notificationsEnabled !== undefined
            ? notificationsEnabled
            : undefined,
        digestFrequency: digestFrequency || undefined,
        statusUpdates: statusUpdates !== undefined ? statusUpdates : undefined,
        messages: messages !== undefined ? messages : undefined,
      },
      create: {
        clientId: session.clientId,
        notificationsEnabled:
          notificationsEnabled !== undefined ? notificationsEnabled : true,
        digestFrequency: digestFrequency || 'daily',
        statusUpdates: statusUpdates !== undefined ? statusUpdates : true,
        messages: messages !== undefined ? messages : true,
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
