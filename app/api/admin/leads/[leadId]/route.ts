import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus, isFurtherAlong, lostAtForStatusChange, wonAtForStatusChange } from '@/lib/leads';
import { ensurePlaybookSeeded } from '@/lib/playbook-seed';
import { clientMockupLink, mockupInclude, normalizeMockupUrl, recordLeadMockup } from '@/lib/mockups';
import { findDesigner } from '@/lib/notify';
import { mockupRequestEmail } from '@/lib/email';
import { sendAsUser } from '@/lib/mailer';
import { decryptSecret } from '@/lib/crypto';
import { parseSalesPoints } from '@/lib/leads';
import { resolveSiteUrl } from '@/lib/site-url';

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
      cancelAutoFollowUp,
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

    /*
     * Whether the address actually changed, rather than merely being sent.
     *
     * Compared case-insensitively and trimmed, because neither changes where
     * an email lands: re-saving "Ben@Acme.test" over "ben@acme.test" is not a
     * correction and must not clear a real bounce.
     */
    const emailCorrected =
      email !== undefined &&
      (email ?? '').trim().toLowerCase() !== (existing.email ?? '').trim().toLowerCase();

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
        wonAt: wonAtForStatusChange(status ?? autoStatus, existing),
        lostAt: lostAtForStatusChange(status ?? autoStatus, existing),
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
        // Asking for a mockup cancels the automated follow-up. The mockup
        // email IS the second touch, and a lead who gets both in the same
        // week learns that our emails are automatic — which is the one thing
        // the sequence exists not to be. See lib/auto-follow-up.ts.
        //
        // And the manual stop, for the case the rules cannot see: the rep
        // knows something about this conversation that no column holds. An
        // automated email you can watch approaching and cannot stop is worse
        // than no automation at all.
        autoFollowUpDueAt:
          mockupRequested === true || cancelAutoFollowUp === true ? null : undefined,
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
        // A new address clears the bounce flag, for the same reason a new
        // phone number clears the dead-number flag above — and it was the
        // half of that rule nobody had written.
        //
        // What the flag means is "this address doesn't work". Correcting the
        // address is the one act that makes that untrue, and it was leaving
        // the flag standing: the lead stayed pinned in the call queue's
        // "bounced" band ahead of its real reason, and the automatic
        // follow-up sequence skips a flagged lead outright, so a rep who
        // fixed the address had quietly switched the emails off for them.
        //
        // The "Mark resolved" link on the lead page stays for the other case,
        // where the address was right all along and their mailbox was full.
        emailDeliveryFailedAt: clearEmailFailure || emailCorrected ? null : undefined,
        emailDeliveryFailedReason: clearEmailFailure || emailCorrected ? null : undefined,
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
      /*
       * On the lead's own timeline, with a name on it.
       *
       * Two things needed this. The lead's history read "called them" and
       * then, with no explanation, a mockup existed — the decision that
       * produced it was nowhere. And nothing else in the system knows who
       * asked: `mockupRequestedAt` is a bare timestamp, so "how many did Evan
       * get out of yesterday" had no answer. An activity row has an author,
       * which makes it both a history and a scoreboard.
       */
      await prisma.leadActivity
        .create({
          data: {
            leadId,
            type: 'note',
            content: `Mockup requested — they wanted to see one.`,
            createdById: session.userId,
          },
        })
        .catch((err) => console.error('Could not log the mockup request:', err));

      await prisma.teamMessage.create({
        data: {
          content: `🎨 Mockup requested for ${lead.company}`,
          fromUserId: session.userId,
          relatedLeadId: leadId,
          urgent: true,
        },
      });

      /*
       * And in an inbox, from the person asking.
       *
       * The team message alone reaches whoever has the tab open. Sent as the
       * requester rather than from the shared address, so it lands with a
       * name on it and a reply goes back to them rather than into info@ —
       * the same reasoning as the post-call follow-up.
       *
       * Everything after this point is a notification about work that is
       * already recorded, so a failure is logged and swallowed: the request
       * itself is saved either way, and 500ing here would tell the rep their
       * request did not go through when it did.
       */
      try {
        const [designer, requester] = await Promise.all([
          findDesigner(),
          prisma.user.findUnique({
            where: { id: session.userId },
            select: {
              name: true,
              email: true,
              gmailAddress: true,
              gmailAppPassword: true,
              googleRefreshToken: true,
            },
          }),
        ]);

        // Asking yourself for a mockup needs no email about it.
        if (designer.email && designer.email !== requester?.email) {
          const mail = mockupRequestEmail({
            company: lead.company,
            requestedBy: requester?.name ?? null,
            leadUrl: `${resolveSiteUrl()}/admin/leads/${leadId}`,
            currentSite: lead.originalWebsite,
            assessment: lead.currentSiteAssessment,
            essentials: parseSalesPoints(lead.essentialPoints).map((p) => p.point),
            note: lead.salesNote,
          });

          const result = await sendAsUser(
            {
              name: requester?.name ?? null,
              email: requester?.email ?? null,
              gmailAddress: requester?.gmailAddress ?? null,
              gmailAppPassword: requester?.gmailAppPassword
                ? decryptSecret(requester.gmailAppPassword)
                : null,
              googleRefreshToken: requester?.googleRefreshToken
                ? decryptSecret(requester.googleRefreshToken)
                : null,
            },
            { to: designer.email, subject: mail.subject, html: mail.html }
          );

          await prisma.leadActivity
            .create({
              data: {
                leadId,
                type: 'email',
                content: result.ok
                  ? `Mockup requested — ${designer.email} told by email.`
                  : `Mockup requested, but the email to ${designer.email} did not send.`,
                createdById: session.userId,
              },
            })
            .catch((e) => console.error('Mockup request activity not written:', e));
        }
      } catch (e) {
        console.error('Mockup request email failed after the request was saved:', e);
      }
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
