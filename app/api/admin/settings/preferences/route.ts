import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { previewBeforeBulkSend: true, weeklyDigestOptOut: true },
    });

    return NextResponse.json(
      {
        previewBeforeBulkSend: user?.previewBeforeBulkSend ?? true,
        weeklyDigestOptOut: user?.weeklyDigestOptOut ?? false,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { previewBeforeBulkSend, weeklyDigestOptOut } = await request.json();

    const data: { previewBeforeBulkSend?: boolean; weeklyDigestOptOut?: boolean } = {};
    if (typeof previewBeforeBulkSend === 'boolean') data.previewBeforeBulkSend = previewBeforeBulkSend;
    if (typeof weeklyDigestOptOut === 'boolean') data.weeklyDigestOptOut = weeklyDigestOptOut;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await prisma.user.update({ where: { id: session.userId }, data });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Update preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
