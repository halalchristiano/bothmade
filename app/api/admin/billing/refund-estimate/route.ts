import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { amountPaidTowardProject } from '@/lib/billing';
import { AGENCY_RATE_CENTS, PREPAYMENT_ADMIN_FEE_CENTS } from '@/lib/contract-terms';
import {
  allocateRefund,
  explainEntitlement,
  isRefundScenario,
  refundEntitlement,
  type RefundScenario,
} from '@/lib/refund-entitlement';
import { ensureInstalments } from '@/lib/instalments';

/**
 * "If this ended today, what do they get back?"
 *
 * Section 8 answers it exactly, and the answer moves with every gate the
 * project passes — so working it out by hand means re-reading four hundred
 * words and doing the arithmetic again each time, usually on a call, usually
 * with a client waiting. This is that, computed.
 *
 * Deliberately a GET with no side effects. It changes nothing, refunds
 * nothing, and can be opened as often as anyone likes: the whole value is in
 * being able to check the number before committing to it.
 *
 * The rates come back in the payload rather than being imported by the page.
 * lib/contract-terms builds every clause of every conditional exhibit, and
 * pulling that into a browser bundle to render two figures is the sort of
 * import that quietly doubles a page.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'Pick a customer first.' }, { status: 400 });
    }

    const scenarioParam = searchParams.get('scenario');
    const scenario: RefundScenario = isRefundScenario(scenarioParam) ? scenarioParam : 'client-cancels';

    const hoursParam = Number(searchParams.get('hours'));
    const hoursWorked = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 10_000) : 0;

    const feeParam = Number(searchParams.get('processorFee'));
    const processorFeeCents = Number.isFinite(feeParam) && feeParam > 0 ? Math.round(feeParam) : 0;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        status: true,
        statusStage: true,
        totalPrice: true,
        convertedFromLeadId: true,
        payments: { select: { amount: true, type: true } },
        client: { select: { company: true } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'That customer no longer exists.' }, { status: 404 });
    }

    // Which form of Section 8 applies. It lives on the Lead because that is
    // where the contract was generated; a project onboarded by hand has no
    // lead, and the contract's default — and its stated warranty — is
    // business, so that is the assumption when nothing says otherwise.
    let consumer = false;
    if (project.convertedFromLeadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: project.convertedFromLeadId },
        select: { isConsumer: true },
      });
      consumer = lead?.isConsumer === true;
    }

    // A pre-instalment project has no gates to reason about until it has a
    // schedule. Same call the payment panel makes, and idempotent.
    const instalments = await ensureInstalments(projectId);

    const entitlement = refundEntitlement({
      scenario,
      consumer,
      statusStage: project.statusStage,
      totalPrice: project.totalPrice,
      paidCents: amountPaidTowardProject(project.payments),
      instalments: instalments.map((i) => ({
        index: i.index,
        label: i.label,
        amountCents: i.amountCents,
        trigger: i.trigger,
        status: i.status,
      })),
      hoursWorked,
      agencyRateCents: AGENCY_RATE_CENTS,
      adminFeeCents: PREPAYMENT_ADMIN_FEE_CENTS,
      processorFeeCents,
    });

    // Where the refundable money actually sits. The entitlement is a fact
    // about the project; a refund goes against one invoice, so the pot has to
    // be shared out before anybody can act on it. See allocateRefund().
    const invoices = await prisma.invoice.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        number: true,
        description: true,
        amountCents: true,
        refundedCents: true,
        status: true,
        createdAt: true,
      },
    });
    const allocation = allocateRefund(invoices, entitlement.settlement.returnedToClientCents);

    return NextResponse.json(
      {
        success: true,
        explanation: explainEntitlement({
          entitlement,
          scenario,
          consumer,
          company: project.client.company,
          hoursWorked,
          agencyRateCents: AGENCY_RATE_CENTS,
        }),
        allocation,
        project: {
          id: project.id,
          name: project.name,
          company: project.client.company,
          status: project.status,
          statusStage: project.statusStage,
          totalPrice: project.totalPrice,
        },
        consumer,
        scenario,
        agencyRateCents: AGENCY_RATE_CENTS,
        adminFeeCents: PREPAYMENT_ADMIN_FEE_CENTS,
        entitlement,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Refund estimate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
