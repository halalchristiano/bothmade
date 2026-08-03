import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year'));
    const month = Number(searchParams.get('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
      return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
    }

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 1);

    const payments = await prisma.payment.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' },
      include: { project: { select: { id: true, name: true, client: { select: { company: true } } } } },
    });

    return NextResponse.json(
      {
        success: true,
        payments: payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          type: p.type,
          createdAt: p.createdAt,
          projectId: p.project.id,
          projectName: p.project.name,
          company: p.project.client.company,
        })),
        total: payments.reduce((s, p) => s + p.amount, 0),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get revenue breakdown error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
