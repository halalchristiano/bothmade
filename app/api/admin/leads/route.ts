import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus } from '@/lib/leads';
import type { Prisma } from '@prisma/client';
import { pageMeta, parsePageParams, searchFilter } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assignedToId = searchParams.get('assignedToId');
    const hotOnly = searchParams.get('hot') === 'true';

    // Search moves server-side with the paging. Filtering an array the
    // client no longer holds in full would silently search one page.
    const search = searchFilter(searchParams.get('q'), [
      'company',
      'contactName',
      'email',
      'phone',
    ] as const);

    const where: Prisma.LeadWhereInput = {
      ...(status && isLeadStatus(status) ? { status } : {}),
      ...(assignedToId
        ? { assignedToId: assignedToId === 'unassigned' ? null : assignedToId }
        : {}),
      ...(hotOnly ? { hotLead: true } : {}),
      ...(search ?? {}),
    };

    const params = parsePageParams(searchParams);

    // Count and page in parallel — the count is what lets the UI show
    // "1–50 of 3,200" instead of pretending the page is the whole set.
    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          activities: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        // id breaks ties so rows can't shuffle between pages when two
        // leads share an updatedAt.
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
    ]);

    return NextResponse.json(
      { success: true, leads, ...pageMeta(params, total) },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
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
