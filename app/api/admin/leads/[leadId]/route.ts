import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus, isFurtherAlong } from '@/lib/leads';
import { ensurePlaybookSeeded } from '@/lib/playbook-seed';

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

    // Fills in any new PLAYBOOK_SEED items the database doesn't have yet, so
    // adding content to the seed file is enough — nobody has to run a
    // migration script by hand for it to show up on a lead's page.
    await ensurePlaybookSeeded(prisma).catch((err) => {
      console.error('Playbook seed failed, serving existing rows:', err);
    });

    // Sent alongside the lead so the brief can price and justify every line
    // item in one round trip — a second request could leave the page showing
    // items with no answer beside them while it resolved.
    // Supplementary content: if the table or a column isn't there yet (a
    // deploy landing before its migration, a migration that failed), the rep
    // should lose the pitch notes, not the entire lead page.
    const playbook = await prisma.salesPlaybookItem
      .findMany({
        select: {
          slug: true,
          label: true,
          kind: true,
          priceCents: true,
          whatItIs: true,
          benefit: true,
          pitch: true,
          justification: true,
          objection: true,
        },
      })
      .catch((err) => {
        console.error('Playbook unavailable, serving lead without it:', err);
        return [];
      });

    // Duplicates already exist from overlapping CSV imports, and the damage
    // is done at the moment of dialling: ringing a business someone spoke to
    // yesterday. Cheaper to warn here than to reconcile the whole table.
    const companyKey = lead.company.toLowerCase().replace(/[^a-z0-9]/g, '');
    // A blank or punctuation-only name is not an identity — matching on it
    // pairs every unnamed lead with every other one.
    const matchableCompany = companyKey.length > 0;
    const leadEmail = lead.email?.trim().toLowerCase() || null;
    const possibleDuplicates = !matchableCompany && !leadEmail ? [] : (
      await prisma.lead.findMany({
        where: {
          id: { not: leadId },
          status: { notIn: ['lost'] },
          OR: [
            ...(leadEmail ? [{ email: { equals: leadEmail, mode: 'insensitive' as const } }] : []),
            ...(matchableCompany
              ? [{ company: { equals: lead.company, mode: 'insensitive' as const } }]
              : []),
          ],
        },
        select: { id: true, company: true, email: true, status: true, updatedAt: true },
        take: 5,
      })
    )
      // The '|| !!lead.email' this replaced meant every row survived whenever
      // the lead had an email at all, so the query's OR went unchecked and
      // unrelated businesses were flagged as duplicates of each other.
      .filter(
        (d) =>
          (matchableCompany &&
            d.company.toLowerCase().replace(/[^a-z0-9]/g, '') === companyKey) ||
          (!!leadEmail && d.email?.trim().toLowerCase() === leadEmail)
      );

    return NextResponse.json(
      { success: true, lead, playbook, possibleDuplicates },
      { status: 200 }
    );
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
      phoneInvalid,
      phoneInvalidReason,
      assignedToId,
      originalWebsite,
      salesNote,
      currentSiteAssessment,
      customPainPoints,
      essentialPoints,
      upsellPoints,
      estimateLowCents,
      estimateHighCents,
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

    // The moment a deal was actually won, recorded once.
    //
    // Revenue and conversion reporting used updatedAt as a stand-in, so
    // editing a note on a deal closed in March moved it into this month's
    // numbers and the ops and sales figures stopped reconciling. Stamped on
    // the transition into 'won' and cleared if it ever moves back out, so
    // the field cannot disagree with the status.
    const effectiveStatus = status ?? autoStatus ?? existing.status;
    const wonAt =
      effectiveStatus === 'won'
        ? existing.wonAt ?? new Date()
        : existing.wonAt
        ? null
        : undefined;

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        wonAt,
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
        // Stamp the delivery once, on the transition from "no mockup" to
        // "mockup". Re-stamping on every subsequent save meant fixing a typo
        // in the URL three days later rewrote history to say the mockup had
        // been delivered that afternoon — and every "days since we sent the
        // mockup" figure hanging off it reset with it. Clearing the URL
        // clears the stamp, so the pair can't disagree.
        mockupDeliveredAt:
          mockupUrl === undefined
            ? undefined
            : mockupUrl
            ? existing.mockupDeliveredAt ?? new Date()
            : null,
        qualNeed: qualNeed !== undefined ? qualNeed : undefined,
        qualAuthority: qualAuthority !== undefined ? qualAuthority : undefined,
        qualBudget: qualBudget !== undefined ? qualBudget : undefined,
        qualTiming: qualTiming !== undefined ? qualTiming : undefined,
        qualMotivation: qualMotivation !== undefined ? qualMotivation : undefined,
        qualifiedAt,
        // Marking a number dead drops the lead out of the call rotation;
        // clearing it puts them back. Stamped once on the transition so
        // "when did we find out" survives later edits.
        phoneInvalid: phoneInvalid !== undefined ? Boolean(phoneInvalid) : undefined,
        phoneInvalidAt:
          phoneInvalid === undefined
            ? undefined
            : phoneInvalid
            ? existing.phoneInvalidAt ?? new Date()
            : null,
        phoneInvalidReason:
          phoneInvalid === false
            ? null
            : phoneInvalidReason !== undefined
            ? phoneInvalidReason
            : undefined,
        emailDeliveryFailedAt: clearEmailFailure ? null : undefined,
        emailDeliveryFailedReason: clearEmailFailure ? null : undefined,
        assignedToId: assignedToId !== undefined ? (assignedToId || null) : undefined,
        originalWebsite: originalWebsite !== undefined ? originalWebsite : undefined,
        salesNote: salesNote !== undefined ? salesNote : undefined,
        currentSiteAssessment: currentSiteAssessment !== undefined ? currentSiteAssessment : undefined,
        customPainPoints: customPainPoints !== undefined ? customPainPoints : undefined,
        essentialPoints: essentialPoints !== undefined ? essentialPoints : undefined,
        upsellPoints: upsellPoints !== undefined ? upsellPoints : undefined,
        estimateLowCents: estimateLowCents !== undefined ? estimateLowCents : undefined,
        estimateHighCents: estimateHighCents !== undefined ? estimateHighCents : undefined,
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
          kind: 'mockup_request',
        },
      });
    }
    if (mockupUrl !== undefined && mockupUrl && !existing.mockupUrl) {
      // Resolve the mockup request, and only the mockup request. This used
      // to close every urgent unresolved flag on the lead — "are we
      // discounting this?", "is their domain transferring?" — none of which
      // delivering a mockup answers. Those questions then vanished from the
      // flag list having never been dealt with.
      await prisma.teamMessage.updateMany({
        where: { relatedLeadId: leadId, urgent: true, resolved: false, kind: 'mockup_request' },
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
