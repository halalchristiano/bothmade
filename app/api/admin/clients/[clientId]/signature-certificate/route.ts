import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { buildSignatureCertificatePdf } from '@/lib/signature-certificate';
import { BASE_SERVICES, formatCents, isBaseService } from '@/lib/pricing';

/**
 * The evidence packet for one paid client: everything the signature record
 * holds, as a document you can hand to a chargeback rep, an insurer, or
 * opposing counsel without first reconstructing it from the admin UI.
 *
 * Two gates, and they are the point rather than an afterthought:
 *
 *  - **A signature must exist.** Without `agreementSignedAt` there is
 *    nothing to certify, and a certificate asserting a signature that was
 *    never recorded is worse than no certificate.
 *  - **Payment must have landed.** A certificate is a claim that the deal
 *    completed. Issuing one for an agreement that was signed and then
 *    abandoned at checkout would put a document into the world that says
 *    more than the record supports.
 *
 * Ops-only, like every other route that touches client money.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { clientId } = await params;
    const requestedProjectId = request.nextUrl.searchParams.get('projectId');

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        projects: {
          orderBy: { createdAt: 'desc' },
          include: { payments: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // A client can hold several projects. Name one explicitly, or take the
    // most recent that could produce a certificate at all — never silently
    // certify a different project than the one that was asked for.
    const candidates = requestedProjectId
      ? client.projects.filter((p) => p.id === requestedProjectId)
      : client.projects.filter((p) => p.convertedFromLeadId && p.payments.length > 0);
    const project = candidates[0];

    if (!project) {
      return NextResponse.json(
        { error: 'No project on this client has both a signed agreement and a recorded payment.' },
        { status: 404 }
      );
    }
    if (!project.convertedFromLeadId) {
      return NextResponse.json(
        {
          error:
            'This project was onboarded manually rather than through a sign-and-pay link, so there is no signature record behind it.',
        },
        { status: 409 }
      );
    }
    if (project.payments.length === 0) {
      return NextResponse.json(
        { error: 'No payment is recorded against this project yet.' },
        { status: 409 }
      );
    }

    const lead = await prisma.lead.findUnique({ where: { id: project.convertedFromLeadId } });
    if (!lead) {
      return NextResponse.json(
        { error: 'The lead this project was converted from no longer exists, so the signature record is gone.' },
        { status: 409 }
      );
    }
    if (!lead.agreementSignedAt) {
      return NextResponse.json(
        { error: 'No electronic signature is recorded against this agreement.' },
        { status: 409 }
      );
    }

    const activities = await prisma.leadActivity.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, content: true },
    });

    // The lead's own figure is what was agreed to; the project's is what was
    // carried over. They should match, and where they don't, the agreement wins.
    const totalPrice = lead.proposalTotalPrice && lead.proposalTotalPrice > 0 ? lead.proposalTotalPrice : project.totalPrice;
    const serviceKey = lead.proposalBaseService || project.baseService;

    const pdfBytes = await buildSignatureCertificatePdf({
      reference: lead.id,
      company: lead.company,
      contactName: lead.contactName,
      clientEmail: lead.email || client.email,
      serviceLabel: isBaseService(serviceKey) ? BASE_SERVICES[serviceKey].label : serviceKey,
      totalPriceLabel: formatCents(totalPrice),
      signerName: lead.agreementSignerName,
      signedAt: lead.agreementSignedAt,
      ip: lead.agreementIp,
      userAgent: lead.agreementUserAgent,
      statement: lead.agreementStatement,
      documentHash: lead.agreementHash,
      signedContractUrl: lead.signedContractUrl,
      payments: project.payments.map((p) => ({
        at: p.createdAt,
        amountLabel: formatCents(p.amount),
        type: p.type,
        stripeSessionId: p.stripeSessionId,
      })),
      events: activities.map((a) => ({ at: a.createdAt, description: a.content })),
      generatedAt: new Date(),
      generatedBy: session.email,
    });

    // Issuing a certificate is itself an event in the record. Who produced
    // one and when is exactly the sort of thing you want on the trail if
    // the document ever turns up somewhere and its provenance is asked
    // about. It must never cost anybody the download, though.
    await prisma.leadActivity
      .create({
        data: {
          leadId: lead.id,
          type: 'note',
          content: `Signature certificate issued for ${client.company}.`,
          createdById: session.userId,
        },
      })
      .catch((e) => console.error('Failed to log certificate issue:', e));

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${lead.company.replace(/[^a-z0-9]/gi, '-')}-signature-certificate.pdf"`,
        // This document names a person, an address, and a price. It has no
        // business in a shared cache.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Signature certificate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
