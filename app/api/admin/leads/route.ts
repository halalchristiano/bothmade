import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus } from '@/lib/leads';

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Record<string, string> = {};
    if (status && isLeadStatus(status)) where.status = status;

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ success: true, leads }, { status: 200 });
  } catch (error) {
    console.error('Get leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const { company, contactName, email, phone, source, estimatedValue, painPoints, notes, status } =
      await request.json();

    if (!company) {
      return NextResponse.json({ error: 'Company is required' }, { status: 400 });
    }

    let lostReason: string | undefined;
    if (status !== undefined && !isLeadStatus(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (status === 'lost' && typeof notes === 'string' && notes.trim()) {
      lostReason = notes.trim();
    }

    const lead = await prisma.lead.create({
      data: {
        company,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        source: source || null,
        estimatedValue: typeof estimatedValue === 'number' ? estimatedValue : null,
        painPoints: Array.isArray(painPoints) ? painPoints.join(',') : '',
        notes: notes || null,
        status: status || undefined,
        lostReason,
        assignedToId: session.userId,
      },
    });

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (error) {
    console.error('Create lead error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
