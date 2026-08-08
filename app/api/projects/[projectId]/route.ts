import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { forbiddenResponse, requirePrincipal, unauthorizedResponse } from '@/lib/middleware';
import { amountPaidTowardProject } from '@/lib/billing';
import { ensureInstalments, OWED_INSTALMENT_STATUSES } from '@/lib/instalments';
import { revisionState } from '@/lib/design-feedback';
import { designStage } from '@/lib/design-stages';
import { DIRECTION_STATEMENT, directionStatus } from '@/lib/design-direction';
import { sendProjectLiveEmail } from '@/lib/email';
import { resolveSiteUrl } from '@/lib/site-url';
import { clientWantsEmail } from '@/lib/email-preferences';
import { warrantyEndFrom } from '@/lib/launch';
import { grossReceivedCents, hasCardPayment, receivedCents } from '@/lib/invoice-settlement';

/**
 * `Project.deliverables` is a JSON string column, and this is the client's
 * own project page.
 *
 * Parsed bare, one malformed value took the entire response down with it:
 * not just the file list, but the messages, the invoices, the payment
 * schedule and the design review — everything this route returns — replaced
 * by a 500 on the page a paying client opens to see how their job is going.
 * The admin route reading the same column has always defended against this
 * (see getDeliverables in api/admin/projects/[projectId]/deliverables); the
 * client-facing one never did.
 *
 * An empty list is the right failure. A client with no files listed can ask;
 * a client staring at a broken page cannot tell whether the studio has lost
 * their project.
 */
function readDeliverables(raw: string | null, projectId: string): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`Project ${projectId} has unreadable deliverables JSON; sending an empty list.`);
    return [];
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { session, response } = await requirePrincipal();
    if (!session) return response;

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        instalments: { orderBy: { index: 'asc' } },
        designDirection: true,
        client: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            client: {
              select: { id: true, email: true, company: true },
            },
          },
        },
        updates: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        // One-off charges raised against this project. Both dashboards read
        // this list — it is the same record on either side, which is the
        // point: a client and the studio looking at the same invoice number
        // should never be looking at two different stories. What each side is
        // allowed to see is decided in the mapping below, not here.
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: {
            issuedBy: { select: { name: true, email: true } },
            // An invoice can be part paid by transfer, and both sides need to
            // know: the studio so it chases the right figure, the client so
            // their own dashboard stops asking for money they have sent.
            payments: { select: { amount: true, stripeSessionId: true } },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check authorization - client can only view their own project
    if (session.type === 'client') {
      if (project.clientId !== session.clientId) {
        return forbiddenResponse();
      }
    }

    // Filter sensitive data
    const clientData =
      session.type === 'client'
        ? project.client
        : {
            id: project.client.id,
            email: project.client.email,
            company: project.client.company,
            contactName: project.client.contactName,
          };

    // Only what was paid toward this project's own contracted price —
    // one-off invoices are settled separately and listed separately.
    const amountPaid = amountPaidTowardProject(project.payments);

    // A project older than the schedule gets one on first sight, derived
    // from what it has already been paid. Without this the client's own
    // dashboard shows them a lump "balance due" while their agreement, their
    // invoices and their emails all describe three named payments.
    const instalments =
      project.instalments.length > 0 ? project.instalments : await ensureInstalments(project.id);

    const siteUrl = resolveSiteUrl();

    // Invoice number is the only link between the two — Instalment.invoiceNumber
    // is unique and points at Invoice.number. Used below to give an instalment
    // invoice somewhere to be paid.
    const instalmentByInvoiceNumber = new Map(
      instalments.filter((i) => i.invoiceNumber).map((i) => [i.invoiceNumber as string, i])
    );

    let sourcedLead: { id: string; company: string } | null = null;
    if (session.type === 'user' && project.convertedFromLeadId) {
      sourcedLead = await prisma.lead.findUnique({
        where: { id: project.convertedFromLeadId },
        select: { id: true, company: true },
      });
    }

    return NextResponse.json(
      {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          statusStage: project.statusStage,
          baseService: project.baseService,
          addOns: project.addOns.split(',').filter(Boolean),
          customItems: project.customItems,
          timeline: project.timeline,
          basePrice: project.basePrice,
          totalPrice: project.totalPrice,
          estimatedCompletionDate: project.estimatedCompletionDate,
          liveUrl: project.liveUrl,
          /*
           * The launch, which used to be `liveUrl` and nothing else.
           *
           * These four are the client's as much as ours. The warranty end
           * date especially: the launch email has been telling clients "the
           * warranty period starts today" against nothing they could ever
           * look up, which is a promise with no way to check it.
           */
          domainName: project.domainName,
          readyForLaunchAt: project.readyForLaunchAt,
          launchedAt: project.launchedAt,
          warrantyEndsAt: project.warrantyEndsAt,
          handoverAt: project.handoverAt,
          /*
           * And these are ours alone.
           *
           * One endpoint serves both dashboards, so a field added without
           * thinking about which side is reading is a field the client gets
           * too — and the DNS note says things like "their old developer
           * still owns the account" and "cutover agreed for Tuesday, do not
           * tell them until it works". The checklist is the same: it is our
           * working state, including the checks we have not done yet.
           */
          ...(session.type === 'user'
            ? {
                domainRegistrar: project.domainRegistrar,
                domainAccess: project.domainAccess,
                hostingProvider: project.hostingProvider,
                dnsNote: project.dnsNote,
                launchChecklist: project.launchChecklist,
              }
            : {}),
          amountPaid,
          /*
           * Never below zero, which the raw subtraction here was.
           *
           * `projectBalance()` in lib/billing has clamped this since it was
           * written, and every admin surface goes through it. This endpoint
           * did the arithmetic itself — `totalPrice - amountPaid` — and it is
           * the one that feeds the CLIENT's own portal. A project that has
           * been overpaid, or that carries a payment recorded against it
           * beyond the quoted total, showed the person who paid it a
           * "Balance Due" of minus four thousand pounds, a progress bar
           * pinned at full, and a button underneath asking them for the next
           * instalment.
           *
           * The same figure goes into the "Copy status summary" text, which
           * gets pasted into emails to that client.
           */
          balanceDue: Math.max(0, project.totalPrice - amountPaid),
          payments: project.payments,
          // The schedule the whole instalment feature reads. Fetched above
          // since the feature shipped — but never actually returned, which
          // left the client's "Payment N of 3" list dead and the pay button
          // falling through to the lump-balance label. Checkout internals
          // (session ids, raw payment URLs) stay server-side; the client
          // pays through pay-balance, which validates freshness.
          instalments: instalments.map((inst) => ({
            id: inst.id,
            index: inst.index,
            count: inst.count,
            label: inst.label,
            percent: inst.percent,
            amountCents: inst.amountCents,
            trigger: inst.trigger,
            status: inst.status,
            invoiceNumber: inst.invoiceNumber,
            dueAt: inst.dueAt,
            paidAt: inst.paidAt,
          })),
          // Who raised an invoice is an internal detail — the client gets
          // the invoice, not the org chart.
          invoices: project.invoices.map((invoice) => {
            /*
             * Where this invoice can actually be paid.
             *
             * An instalment invoice has no `paymentUrl` of its own and never
             * has: the checkout lives on the Instalment row and dies after 24
             * hours, so storing it here would be storing a corpse. The client
             * dashboard renders this field as its Pay button and falls back to
             * "We'll send a payment link for this shortly" when it is null —
             * so every instalment invoice appeared unpayable, promising a link
             * that had already been emailed days earlier, directly below a
             * payment schedule offering to take the same money.
             *
             * /pay resolves a live session when it is clicked, and refuses for
             * anything settled or cancelled, so this is safe to hand over for
             * any row that is still owed.
             *
             * Absolute, not relative. The admin project page reads this same
             * route and renders a "Copy pay link" button from it — a relative
             * path in a clipboard is a broken link the moment it is pasted
             * into an email. It also has to survive being sent from any host
             * the admin happens to be on, which is what resolveSiteUrl is for.
             */
            const received = receivedCents(invoice.payments);

            /*
             * No pay link on a part-paid invoice, for either audience.
             *
             * The link is a fixed-amount Stripe Payment Link for the whole
             * invoice; there is no partial version of it. Offering it to
             * somebody who has already sent half is offering to take the other
             * half plus the half they sent. The row says what is left instead,
             * and the remainder is arranged the way the first part was.
             */
            const inst = instalmentByInvoiceNumber.get(invoice.number);
            const payableUrl =
              // Settled or cancelled: there is nothing to pay, and the stored
              // link is spent or deactivated. Handing it over anyway is how a
              // dead link gets copied out of the admin and sent to a client.
              invoice.status !== 'open'
                ? null
                : // Part paid: see above — the link is for the whole invoice.
                  received > 0
                  ? null
                  : inst
                    ? inst.status !== 'paid' && inst.status !== 'void'
                      ? `${siteUrl}/pay/${inst.id}`
                      : null
                    : invoice.paymentUrl;

            return {
            id: invoice.id,
            number: invoice.number,
            description: invoice.description,
            lineItems: invoice.lineItems,
            amountCents: invoice.amountCents,
            status: invoice.status,
            pdfUrl: invoice.pdfUrl,
            paymentUrl: payableUrl,
            createdAt: invoice.createdAt,
            paidAt: invoice.paidAt,
            // A client whose money came back must be able to see that here.
            // Both sides read this list precisely so the two of us can never
            // be looking at two different stories about the same number.
            refundedCents: invoice.refundedCents,
            refundMethod: invoice.refundMethod,
            refundedAt: invoice.refundedAt,
            // The reasons are written for the client — they are what goes in
            // their email — so there is nothing here to withhold.
            refundReason: invoice.refundReason,
            voidReason: invoice.voidReason,
            issuedBy: session.type === 'user' ? invoice.issuedBy?.name || invoice.issuedBy?.email || null : undefined,
            sentToEmail: session.type === 'user' ? invoice.sentToEmail : undefined,
            /*
             * The chase log, staff only.
             *
             * The project page renders the same invoice actions as the billing
             * ledger, and those actions read these two: the button says "Send
             * again" rather than "Send", and the confirmation says how many
             * times this client has already had it. Without them here, that
             * screen told whoever was about to press send that an invoice
             * chased three times had never been emailed — which is not a
             * missing detail, it is the wrong answer to the question the
             * confirmation exists to ask.
             *
             * Deliberately not sent to the client. How many times we have
             * asked them for money is our business, and reading it back is
             * faintly insulting; the row they see says what they owe and why.
             */
            sendCount: session.type === 'user' ? invoice.sendCount : undefined,
            lastSentAt: session.type === 'user' ? invoice.lastSentAt : undefined,
            // How it was settled when it did not come through Stripe — a
            // reconciliation note typed for our own books, in our own words.
            paidMethod: session.type === 'user' ? invoice.paidMethod : undefined,
            /*
             * How much has arrived — and this one DOES go to the client.
             *
             * Everything else in this staff-only block is about how we have
             * been handling the invoice. This is about their own money. Their
             * dashboard read `status` alone, so an invoice they had part paid
             * showed as "Due" with a Pay button beside it — and that button is
             * a Stripe link for the FULL amount, which would have taken the
             * whole invoice again on top of what they had already sent.
             */
            receivedCents: received,
            /*
             * The same ledger read the other way: money in before any of it
             * went back out. It is what decides how much of a part-paid
             * invoice may be refunded, so the Refund action needs it and the
             * client has no use for it.
             */
            grossReceivedCents: session.type === 'user' ? grossReceivedCents(invoice.payments) : undefined,
            // Whether a card refund is possible at all — the refund route
            // needs a Checkout Session to find the charge behind.
            hasCardPayment: session.type === 'user' ? hasCardPayment(invoice.payments) : undefined,
            };
          }),
          deliverables: readDeliverables(project.deliverables, project.id),
          contractUrl: project.contractUrl,
          // The Section 4 review clock. Both dashboards read it: the client
          // needs to see the deadline they were given, and deemed approval
          // is only defensible if they could.
          designReview: {
            presentedAt: project.designPresentedAt,
            reviewEndsAt: project.designReviewEndsAt,
            approvedAt: project.designApprovedAt,
            deemed: project.designApprovalDeemed,
            // Which version they are looking at, and where they stand in the
            // two rounds Exhibit A includes. Shown to them rather than
            // tracked quietly: it makes people gather their thoughts into one
            // considered list instead of firing off three emails, and the day
            // a round becomes billable is never a surprise.
            round: project.designRound,
            // So the admin panel can offer "ask them for it" when the brief
            // that design is supposed to answer has never been filled in.
            briefSignedAt: project.designDirection?.signedAt ?? null,
            // What this round is called, and what it means — one vocabulary,
            // shared with the email, so a client is never told "revision 1"
            // in one place and "initial design" in the other.
            stage: designStage(project.designRound),
            // Where the design actually is. Without it the dashboard asked
            // them to approve something it could not show them.
            designUrl: project.designUrl,
            revisions: revisionState(project.designRevisionsUsed),
          },
          // The brief they wrote and signed before we designed anything, and
          // the sentence they signed. Sent to the client because a brief they
          // cannot re-read is not much of an agreement — and because seeing
          // it beside the design is how they judge whether we hit it.
          designDirection: project.designDirection,
          designDirectionStatus: directionStatus(project.designDirection),
          designDirectionStatement: DIRECTION_STATEMENT,
          // Capability token for the public /status link. Only handed to
          // people already authorized to see the project — it's the secret
          // that makes the shared link work, so it travels no further than
          // the dashboard that offers "copy share link".
          shareToken: project.shareToken,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          client: clientData,
          messages: project.messages,
          updates: project.updates,
          sourcedLead: session.type === 'user' ? sourcedLead : undefined,
          handoffAcknowledgedAt: session.type === 'user' ? project.handoffAcknowledgedAt : undefined,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get project error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getCurrentSession();

    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const { projectId } = await params;
    const body = await request.json();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: body.name,
        description: body.description,
        /*
         * `status` and `statusStage` are gone from here too, for the reason
         * the paragraph below already gives about price.
         *
         * A project's stage is not a column. Moving it is an event:
         * /api/admin/projects/[projectId]/status writes a ProjectUpdate the
         * client can read, emails them if they want status mail, and works
         * out whether the move opened a payment gate — that route is where
         * "Design Approval happened" is decided. Setting the column through
         * here did the one part that changes money and none of the parts that
         * tell anybody, so a project could arrive at Launch with its client
         * never told and Payment 3 quietly payable.
         *
         * `statusStage` is the sharper of the two: gateReached() in
         * lib/billing.ts reads it directly to decide which instalments are
         * owed. A raw write moves the gates.
         *
         * Nothing has ever sent either field here — every caller in the app
         * sends acknowledgeHandoff, estimatedCompletionDate or liveUrl — which
         * is the same reason the price fields were safe to remove.
         */
        // baseService, addOns, basePrice and totalPrice are deliberately NOT
        // settable here any more.
        //
        // This route accepted all four from any signed-in staff account. No
        // record was written, the client was never told, and the instalment
        // schedule did not follow — so a contracted price could be rewritten
        // and the three payments beneath it would go on describing the old
        // one. Nothing in the UI ever sent them, which is the only reason it
        // was never used.
        //
        // Section 9 of the contract is explicit that scope and fee move by
        // written amendment the client approves. That is what a Change Order
        // is, and it is now the only path: see
        // /api/public/change/[token], which moves the price, the scope and the
        // schedule together, inside one transaction, only once someone has
        // signed for it.
        timeline: body.timeline,
        estimatedCompletionDate:
          body.estimatedCompletionDate !== undefined
            ? body.estimatedCompletionDate
              ? new Date(body.estimatedCompletionDate)
              : null
            : undefined,
        liveUrl: body.liveUrl !== undefined ? body.liveUrl || null : undefined,
        deliverables: body.deliverables
          ? JSON.stringify(body.deliverables)
          : undefined,
        handoffAcknowledgedAt:
          body.acknowledgeHandoff === true && !project.handoffAcknowledgedAt
            ? new Date()
            : body.acknowledgeHandoff === false
            ? null
            : undefined,
      },
    });

    /*
     * The launch, said out loud.
     *
     * Setting the live URL lit up a delivery moment on the client's dashboard
     * and told them nothing — so the one email in the whole engagement that is
     * unambiguously good news arrived only if they happened to log in that
     * week. Fires once, on the transition from no URL to a URL, so editing a
     * typo in it later does not announce the launch a second time.
     */
    const launchedAt = new Date();
    const justWentLive = Boolean(updatedProject.liveUrl) && !project.liveUrl;
    if (justWentLive && updatedProject.liveUrl) {
      /*
       * When, not just whether.
       *
       * `liveUrl` recorded that a project had launched and nothing recorded
       * the day — which is the day Section 16's thirty-day Warranty Period
       * counts from, and the day the email going out below has been telling
       * clients it starts. The end is computed once and stored, for the same
       * reason the design review deadline is: a date a client has been given
       * must not move because a helper changed later.
       */
      await prisma.project
        .update({
          where: { id: projectId },
          data: { launchedAt: launchedAt, warrantyEndsAt: warrantyEndFrom(launchedAt) },
        })
        .catch((e) => console.error('Launch date not stamped:', e));

      try {
        const client = await prisma.client.findUnique({
          where: { id: project.clientId },
          select: { email: true, contactName: true, emailPreferences: true },
        });
        /*
         * This count drives the launch email's "there is still a balance
         * outstanding ... the final handover completes once it clears".
         *
         * It was `not: 'paid'`, which counts voided rows as owed — so a
         * client whose remaining instalments had been voided by a change
         * order they signed was told on launch day that their files were
         * being held against a debt that no longer existed.
         */
        const owed = await prisma.instalment.count({
          where: { projectId, status: { in: OWED_INSTALMENT_STATUSES } },
        });
        if (client && clientWantsEmail(client.emailPreferences, 'statusUpdates')) {
          await sendProjectLiveEmail({
            to: client.email,
            contactName: client.contactName,
            projectName: updatedProject.name,
            liveUrl: updatedProject.liveUrl,
            dashboardUrl: `${resolveSiteUrl()}/client/${projectId}`,
            balanceOutstanding: owed > 0,
          });
        }
        await prisma.projectUpdate.create({
          data: {
            projectId,
            title: 'Your project is live',
            description: `It's live at ${updatedProject.liveUrl}. Everything stays on your dashboard — the agreement, the invoices, and a message thread that reaches us directly.`,
            statusStage: updatedProject.status,
            userId: session.type === 'user' ? session.userId : null,
          },
        });
      } catch (e) {
        console.error('Launch announcement failed after the URL was saved:', e);
      }
    }

    if (body.acknowledgeHandoff === true && !project.handoffAcknowledgedAt && project.convertedFromLeadId) {
      const lead = await prisma.lead.findUnique({ where: { id: project.convertedFromLeadId } });
      if (lead) {
        await prisma.teamMessage.create({
          data: {
            content: `👍 Picked up the handoff for ${lead.company} — starting Discovery.`,
            fromUserId: session.userId,
            relatedLeadId: lead.id,
            relatedProjectId: projectId,
          },
        });
      }
    }

    return NextResponse.json(
      { success: true, project: updatedProject },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
