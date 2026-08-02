import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';

/** Every CSV import ever run, most recent first — the permanent receipt trail for "did I already import this" / "who imported these". */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const logs = await prisma.csvImportLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { importedBy: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ success: true, logs }, { status: 200 });
  } catch (error) {
    console.error('Get CSV import history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
