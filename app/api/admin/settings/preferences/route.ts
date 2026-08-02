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
      select: { previewBeforeBulkSend: true },
    });

    return NextResponse.json({ previewBeforeBulkSend: user?.previewBeforeBulkSend ?? true }, { status: 200 });
  } catch (error) {
    console.error('Get preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { previewBeforeBulkSend } = await request.json();
    if (typeof previewBeforeBulkSend !== 'boolean') {
      return NextResponse.json({ error: 'previewBeforeBulkSend must be a boolean' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { previewBeforeBulkSend },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Update preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
