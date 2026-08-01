import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus } from '@/lib/leads';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { leadId } = await params;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, lead }, { status: 200 });
  } catch (error) {
    console.error('Get lead error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { leadId } = await params;
    const body = await request.json();
    const {
      company,
      contactName,
      email,
      phone,
      status,
      source,
      estimatedValue,
      painPoints,
      notes,
      hotLead,
      lostReason,
      nextFollowUpAt,
      contractStatus,
    } = body;

    if (status !== undefined && !isLeadStatus(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (contractStatus !== undefined && !['not_sent', 'sent', 'signed'].includes(contractStatus)) {
      return NextResponse.json({ error: 'Invalid contract status' }, { status: 400 });
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        company: company !== undefined ? company : undefined,
        contactName: contactName !== undefined ? contactName : undefined,
        email: email !== undefined ? email : undefined,
        phone: phone !== undefined ? phone : undefined,
        status: status !== undefined ? status : undefined,
        source: source !== undefined ? source : undefined,
        estimatedValue: estimatedValue !== undefined ? estimatedValue : undefined,
        painPoints: Array.isArray(painPoints) ? painPoints.join(',') : undefined,
        notes: notes !== undefined ? notes : undefined,
        hotLead: hotLead !== undefined ? hotLead : undefined,
        lostReason: lostReason !== undefined ? lostReason : undefined,
        nextFollowUpAt: nextFollowUpAt !== undefined ? (nextFollowUpAt ? new Date(nextFollowUpAt) : null) : undefined,
        contractStatus: contractStatus !== undefined ? contractStatus : undefined,
      },
    });

    return NextResponse.json({ success: true, lead }, { status: 200 });
  } catch (error) {
    console.error('Update lead error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { leadId } = await params;
    await prisma.lead.delete({ where: { id: leadId } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete lead error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
