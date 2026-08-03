import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus } from '@/lib/leads';
import type { Prisma } from '@prisma/client';

/**
 * Reads a DDMMYYYY filter bound. Separators are optional and ISO is accepted,
 * because a date typed into a box and a date pasted out of a spreadsheet
 * rarely look the same and both should work.
 *
 * `end` pushes the boundary to the last millisecond of the day, so "added
 * between 01082026 and 31082026" includes everything added on the 31st
 * rather than silently stopping at midnight that morning.
 */
function parseBoundary(raw: string | null, end = false): Date | null {
  if (!raw) return null;
  const value = raw.trim();
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dmy = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const packed = value.match(/^(\d{2})(\d{2})(\d{4})$/);

  let y: number, m: number, d: number;
  if (iso) [, y, m, d] = iso.map(Number) as [number, number, number, number];
  else if (dmy) [, d, m, y] = dmy.map(Number) as [number, number, number, number];
  else if (packed) [, d, m, y] = packed.map(Number) as [number, number, number, number];
  else return null;

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = end
    ? new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
    : new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  return date.getUTCMonth() === m - 1 ? date : null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Prisma.LeadWhereInput = {};
    if (status && isLeadStatus(status)) where.status = status;

    // "How many businesses did we add between these two dates" — answered off
    // addedAt rather than createdAt, so a sheet researched in July and
    // imported in August still counts as July's work.
    const from = parseBoundary(searchParams.get('addedFrom'));
    const to = parseBoundary(searchParams.get('addedTo'), true);
    if (from || to) {
      where.addedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }

    // Same question for the other end of the funnel: how many of them
    // actually became clients in a given window.
    const wonFrom = parseBoundary(searchParams.get('wonFrom'));
    const wonTo = parseBoundary(searchParams.get('wonTo'), true);
    if (wonFrom || wonTo) {
      where.clientTakenOnAt = { ...(wonFrom ? { gte: wonFrom } : {}), ...(wonTo ? { lte: wonTo } : {}) };
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ success: true, leads, count: leads.length }, { status: 200 });
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
