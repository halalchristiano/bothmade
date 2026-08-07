import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, avatarUrl: true, title: true },
    });

    return NextResponse.json(
      { name: user?.name || '', avatarUrl: user?.avatarUrl || null, title: user?.title || '' },
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

    const { name, avatarUrl, title } = await request.json();

    const data: { name?: string; avatarUrl?: string | null; title?: string | null } = {};
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
    await prisma.user.update({ where: { id: session.userId }, data });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
