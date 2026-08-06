import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus, isFurtherAlong } from '@/lib/leads';
import { ensurePlaybookSeeded } from '@/lib/playbook-seed';
import { clientMockupLink, mockupInclude, normalizeMockupUrl, recordLeadMockup } from '@/lib/mockups';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
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
        // Newest first, because the only two questions asked of this list on
        // a lead's page are "what's the current mockup" and "is there a PDF
        // of it" — both answered by the top of the list.
        mockups: { orderBy: { createdAt: 'desc' }, include: mockupInclude },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // The half of the deal Sales could never see. A lead that converts
    // vanishes out of Sales into Delivery, so "did they actually pay?" — the
    // question the whole pipeline exists to answer — was the one question a
    // rep had to leave the lead page to answer.
    const project = await prisma.project
      .findFirst({
        where: { convertedFromLeadId: leadId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          totalPrice: true,
          // The delivery half. Sales could see whether the money landed but
          // not what happened to the work — and "did the thing I sold turn
          // out well" is the question a closer most wants answered about a
          // deal they are no longer on.
          status: true,
          statusStage: true,
          liveUrl: true,
          instalments: {
            orderBy: { index: 'asc' },
            select: {
              index: true,
              label: true,
              amountCents: true,
              status: true,
              paidAt: true,
              dueAt: true,
            },
          },
        },
      })
      .catch(() => null);

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
      { success: true, lead, playbook, possibleDuplicates, project },
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
    const session = await requireStaff();
    if (!session) {
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
      mockupFolderUrl,
      qualNeed,
      qualAuthority,
      qualBudget,
      qualTiming,
      qualMotivation,
      clearEmailFailure,
      assignedToId,
      originalWebsite,
      salesNote,
      currentSiteAssessment,
      customPainPoints,
      essentialPoints,
      upsellPoints,
      estimateLowCents,
      estimateHighCents,
      mockupPdfUrl,
      invoicePdfUrl,
      vercelDeployPassword,
      industry,
      contactRole,
      address,
      city,
      region,
      postalCode,
      country,
      companySize,
      employeeCount,
      locationCount,
      annualRevenueCents,
      tags,
      doNotContact,
      doNotContactReason,
      leadScore,
      clientTakenOnAt,
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
        // A new number clears the dead-number flag: a lead whose phone has
        // been corrected is callable again, and would otherwise sit in
        // "can't reach" forever with a number that works.
        phoneInvalidAt: phone !== undefined && phone !== existing.phone ? null : undefined,
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
        // Normalised on the way in, because this is the link that gets
        // emailed and a folder URL pasted without its scheme is a dead
        // button in a client's inbox.
        mockupFolderUrl:
          mockupFolderUrl !== undefined ? clientMockupLink({ mockupFolderUrl }) : undefined,
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
        originalWebsite: originalWebsite !== undefined ? originalWebsite : undefined,
        salesNote: salesNote !== undefined ? salesNote : undefined,
        currentSiteAssessment: currentSiteAssessment !== undefined ? currentSiteAssessment : undefined,
        customPainPoints: customPainPoints !== undefined ? customPainPoints : undefined,
        essentialPoints: essentialPoints !== undefined ? essentialPoints : undefined,
        upsellPoints: upsellPoints !== undefined ? upsellPoints : undefined,
        estimateLowCents: estimateLowCents !== undefined ? estimateLowCents : undefined,
        estimateHighCents: estimateHighCents !== undefined ? estimateHighCents : undefined,

        // Stored deliverables. The uploaded-at stamp only moves when the URL
        // actually changes, so re-saving the same link doesn't rewrite the
        // history of when it first landed. (The mockup PDF isn't here — it
        // becomes a row in the mockups list below.)
        invoicePdfUrl: invoicePdfUrl !== undefined ? invoicePdfUrl : undefined,
        invoicePdfUploadedAt:
          invoicePdfUrl !== undefined && invoicePdfUrl && invoicePdfUrl !== existing.invoicePdfUrl
            ? new Date()
            : undefined,
        vercelDeployPassword: vercelDeployPassword !== undefined ? vercelDeployPassword : undefined,

        industry: industry !== undefined ? industry : undefined,
        contactRole: contactRole !== undefined ? contactRole : undefined,
        address: address !== undefined ? address : undefined,
        city: city !== undefined ? city : undefined,
        region: region !== undefined ? region : undefined,
        postalCode: postalCode !== undefined ? postalCode : undefined,
        country: country !== undefined ? country : undefined,
        companySize: companySize !== undefined ? companySize : undefined,
        employeeCount: employeeCount !== undefined ? employeeCount : undefined,
        locationCount: locationCount !== undefined ? locationCount : undefined,
        annualRevenueCents: annualRevenueCents !== undefined ? annualRevenueCents : undefined,
        tags: Array.isArray(tags) ? tags.join(',') : tags !== undefined ? tags : undefined,
        doNotContact: doNotContact !== undefined ? doNotContact : undefined,
        doNotContactReason: doNotContactReason !== undefined ? doNotContactReason : undefined,
        leadScore: leadScore !== undefined ? leadScore : undefined,

        // The day they became a client. Set explicitly when given, otherwise
        // stamped the first time this lead is marked won — nobody should have
        // to remember to record the one date the finance side asks for.
        clientTakenOnAt:
          clientTakenOnAt !== undefined
            ? clientTakenOnAt
              ? new Date(clientTakenOnAt)
              : null
            : (status ?? autoStatus) === 'won' && !existing.clientTakenOnAt
              ? new Date()
              : undefined,
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
    // A delivered link becomes a numbered mockup on the lead (which is also
    // what resolves the urgent request and messages the team). A second link
    // pasted later is version two, not a replacement for version one.
    if (mockupUrl !== undefined && mockupUrl) {
      const url = normalizeMockupUrl(mockupUrl) ?? mockupUrl;
      // The link is already saved on the lead itself at this point, so a
      // failure here costs the version history, not the delivery.
      await recordLeadMockup({ leadId, url, userId: session.userId }).catch((err) => {
        console.error('Could not record mockup version:', err);
      });
    }

    /*
     * The folder becomes a version too, or it falls off the Mockups page.
     *
     * The build queue treats either link as "design has produced something",
     * so pasting a folder takes the lead off "To build". The "Built" tab
     * lists mockup versions. Without this the folder creates no version, and
     * a lead with the deliverable attached appears on neither tab — it
     * vanishes from the only screen named after mockups, at exactly the
     * moment somebody needs to send it.
     *
     * cacheAsLatest is off: the folder already has its own column, and
     * writing it into mockupUrl would overwrite the preview build.
     */
    if (mockupFolderUrl !== undefined && mockupFolderUrl) {
      const url = clientMockupLink({ mockupFolderUrl });
      if (url) {
        await recordLeadMockup({ leadId, url, userId: session.userId, cacheAsLatest: false }).catch(
          (err) => {
            console.error('Could not record folder mockup version:', err);
          }
        );
      }
    }

    // A PDF export goes into the same list rather than a column of its own —
    // it's another version of the mockup, and keeping it here means the
    // history survives the next revision instead of being overwritten by it.
    // `fileName` is what tells the page to offer it as a download.
    if (mockupPdfUrl !== undefined && mockupPdfUrl) {
      const url = normalizeMockupUrl(mockupPdfUrl);
      if (url) {
        await recordLeadMockup({
          leadId,
          url,
          fileName: `${existing.company} mockup.pdf`,
          userId: session.userId,
        }).catch((err) => {
          console.error('Could not record mockup PDF:', err);
        });
      }
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
    const session = await requireStaff();
    if (!session) {
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
