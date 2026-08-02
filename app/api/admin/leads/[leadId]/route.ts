import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus, isFurtherAlong } from '@/lib/leads';

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
      mockupRequested,
      mockupUrl,
      qualNeed,
      qualAuthority,
      qualBudget,
      qualTiming,
      qualMotivation,
      clearEmailFailure,
      assignedToId,
    } = body;

    if (status !== undefined && !isLeadStatus(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (contractStatus !== undefined && !['not_sent', 'sent', 'signed'].includes(contractStatus)) {
      return NextResponse.json({ error: 'Invalid contract status' }, { status: 400 });
    }

    const existing = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Signing the contract is a real pipeline milestone — auto-advance the
    // main status to reflect it, unless the caller is already setting a
    // (presumably more informed) status explicitly in the same request.
    let autoStatus =
      status === undefined && contractStatus === 'signed' && isFurtherAlong(existing.status, 'contract_signed')
        ? 'contract_signed'
        : undefined;

    // Qualification is "complete" once all five BANT answers are on file —
    // that's what actually makes "qualified" mean something instead of a
    // gut call. Merge incoming values over existing so a partial save still
    // detects completion correctly.
    const merged = {
      qualNeed: qualNeed !== undefined ? qualNeed : existing.qualNeed,
      qualAuthority: qualAuthority !== undefined ? qualAuthority : existing.qualAuthority,
      qualBudget: qualBudget !== undefined ? qualBudget : existing.qualBudget,
      qualTiming: qualTiming !== undefined ? qualTiming : existing.qualTiming,
      qualMotivation: qualMotivation !== undefined ? qualMotivation : existing.qualMotivation,
    };
    const nowQualified = Object.values(merged).every((v) => v && v.trim().length > 0);
    const wasQualified = !!existing.qualifiedAt;
    const qualifiedAt = nowQualified && !wasQualified ? new Date() : undefined;
    if (nowQualified && !wasQualified && status === undefined && isFurtherAlong(existing.status, 'qualified')) {
      autoStatus = 'qualified';
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        company: company !== undefined ? company : undefined,
        contactName: contactName !== undefined ? contactName : undefined,
        email: email !== undefined ? email : undefined,
        phone: phone !== undefined ? phone : undefined,
        status: status !== undefined ? status : autoStatus,
        source: source !== undefined ? source : undefined,
        estimatedValue: estimatedValue !== undefined ? estimatedValue : undefined,
        painPoints: Array.isArray(painPoints) ? painPoints.join(',') : undefined,
        notes: notes !== undefined ? notes : undefined,
        hotLead: hotLead !== undefined ? hotLead : undefined,
        lostReason: lostReason !== undefined ? lostReason : undefined,
        nextFollowUpAt: nextFollowUpAt !== undefined ? (nextFollowUpAt ? new Date(nextFollowUpAt) : null) : undefined,
        contractStatus: contractStatus !== undefined ? contractStatus : undefined,
        mockupRequested: mockupRequested !== undefined ? mockupRequested : undefined,
        mockupRequestedAt: mockupRequested === true && !existing.mockupRequested ? new Date() : undefined,
        mockupUrl: mockupUrl !== undefined ? mockupUrl : undefined,
        mockupDeliveredAt: mockupUrl !== undefined && mockupUrl ? new Date() : undefined,
        qualNeed: qualNeed !== undefined ? qualNeed : undefined,
        qualAuthority: qualAuthority !== undefined ? qualAuthority : undefined,
        qualBudget: qualBudget !== undefined ? qualBudget : undefined,
        qualTiming: qualTiming !== undefined ? qualTiming : undefined,
        qualMotivation: qualMotivation !== undefined ? qualMotivation : undefined,
        qualifiedAt,
        emailDeliveryFailedAt: clearEmailFailure ? null : undefined,
        emailDeliveryFailedReason: clearEmailFailure ? null : undefined,
        assignedToId: assignedToId !== undefined ? (assignedToId || null) : undefined,
      },
    });

    // Notify the rest of the team when a mockup is requested or delivered —
    // this is the actual handoff moment ("I need a mockup" / "here's the link").
    if (mockupRequested === true && !existing.mockupRequested) {
      await prisma.teamMessage.create({
        data: {
          content: `🎨 Mockup requested for ${lead.company}`,
          fromUserId: session.userId,
          relatedLeadId: leadId,
          urgent: true,
        },
      });
    }
    if (mockupUrl !== undefined && mockupUrl && !existing.mockupUrl) {
      await prisma.teamMessage.updateMany({
        where: { relatedLeadId: leadId, urgent: true, resolved: false },
        data: { resolved: true },
      });
      await prisma.teamMessage.create({
        data: {
          content: `✅ Mockup ready for ${lead.company}: ${mockupUrl}`,
          fromUserId: session.userId,
          relatedLeadId: leadId,
          urgent: false,
        },
      });
    }

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
