import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isTwilioConfigured, toE164 } from '@/lib/twilio';

export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, avatarUrl: true, title: true, callbackNumber: true },
    });

    return NextResponse.json(
      {
        name: user?.name || '',
        avatarUrl: user?.avatarUrl || null,
        title: user?.title || '',
        callbackNumber: user?.callbackNumber || '',
        // So the field can explain itself rather than sitting there unlabelled
        // on a deployment where calling through the app does nothing.
        callingConfigured: isTwilioConfigured(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { name, avatarUrl, title, callbackNumber } = await request.json();

    const data: {
      name?: string;
      avatarUrl?: string | null;
      title?: string | null;
      callbackNumber?: string | null;
    } = {};
    if (typeof name === 'string') {
      if (!name.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      data.name = name.trim();
    }
    if (avatarUrl === null || typeof avatarUrl === 'string') {
      data.avatarUrl = avatarUrl;
    }
    if (typeof title === 'string') {
      data.title = title.trim() || null;
    }
    if (typeof callbackNumber === 'string') {
      /*
       * Stored in the form a carrier accepts, and refused if it cannot be.
       *
       * This is the number a phone network will ring, so "close enough" means
       * a stranger's handset going off. Better to reject it here, where
       * somebody can read the message, than at the moment a call is placed.
       */
      const trimmed = callbackNumber.trim();
      if (!trimmed) {
        data.callbackNumber = null;
      } else {
        const e164 = toE164(trimmed);
        if (!e164) {
          return NextResponse.json(
            { error: "That doesn't look like a number we can ring — include the area code." },
            { status: 400 }
          );
        }
        data.callbackNumber = e164;
      }
    }

    await prisma.user.update({ where: { id: session.userId }, data });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
