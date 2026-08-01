import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'client') {
      return unauthorizedResponse();
    }

    const client = await prisma.client.findUnique({
      where: { id: session.clientId },
      include: { emailPreferences: true },
    });

    if (!client) {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      {
        success: true,
        client: {
          email: client.email,
          company: client.company,
          contactName: client.contactName,
          phone: client.phone,
          mustChangePassword: client.mustChangePassword,
        },
        preferences: client.emailPreferences,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get client settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'client') {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const {
      notificationsEnabled,
      digestFrequency,
      statusUpdates,
      messages,
      currentPassword,
      newPassword,
    } = body;

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to set a new password' },
          { status: 400 }
        );
      }

      const client = await prisma.client.findUnique({
        where: { id: session.clientId },
      });

      if (!client) {
        return unauthorizedResponse();
      }

      const isValid = await verifyPassword(currentPassword, client.password);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        );
      }

      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return NextResponse.json(
          { error: 'New password must be at least 8 characters' },
          { status: 400 }
        );
      }

      const hashedPassword = await hashPassword(newPassword);
      await prisma.client.update({
        where: { id: session.clientId },
        data: { password: hashedPassword, mustChangePassword: false },
      });
    }

    const hasPreferenceUpdate =
      notificationsEnabled !== undefined ||
      digestFrequency !== undefined ||
      statusUpdates !== undefined ||
      messages !== undefined;

    let preferences = null;
    if (hasPreferenceUpdate) {
      preferences = await prisma.emailPreferences.update({
        where: { clientId: session.clientId },
        data: {
          notificationsEnabled:
            notificationsEnabled !== undefined ? notificationsEnabled : undefined,
          digestFrequency: digestFrequency || undefined,
          statusUpdates: statusUpdates !== undefined ? statusUpdates : undefined,
          messages: messages !== undefined ? messages : undefined,
        },
      });
    }

    return NextResponse.json({ success: true, preferences }, { status: 200 });
  } catch (error) {
    console.error('Update client settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
