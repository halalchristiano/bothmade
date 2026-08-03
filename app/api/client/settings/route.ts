import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { requireClient, unauthorizedResponse } from '@/lib/middleware';
import { checkPasswordStrength } from '@/lib/password-policy';

export async function GET() {
  try {
    // allowPasswordChange: this is the page a client is sent to *because*
    // they still have the auto-generated password, so it has to stay open
    // to them while everything else is closed.
    const { session, response } = await requireClient({ allowPasswordChange: true });
    if (!session) return response;

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
    const { session, response } = await requireClient({ allowPasswordChange: true });
    if (!session) return response;

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

      // Same policy as every other place a password gets set — this used
      // to be the only check in the app, and it was "8 characters".
      const strength = checkPasswordStrength(newPassword, client.email);
      if (!strength.ok) {
        return NextResponse.json({ error: strength.error }, { status: 400 });
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
