import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { amountPaidTowardProject } from '@/lib/billing';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { OPS, requireRole } from '@/lib/authz';
import { formatCents } from '@/lib/pricing';

/**
 * Every signature that can be certified, across every client — the index
 * behind the dashboard card.
 *
 * The list deliberately matches the certificate route's gates exactly: a
 * signed agreement, a recorded payment, and a lead still on file. A row
 * that appears here and then fails to download would be worse than no row,
 * because the moment you need this you are already having a bad day.
 */
export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, OPS);
    if (denied) return denied;

    // Start from projects rather than clients: the certificate is per
    // agreement, and one client can hold several.
    const projects = await prisma.project.findMany({
      where: { convertedFromLeadId: { not: null }, payments: { some: {} } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        totalPrice: true,
        convertedFromLeadId: true,
        client: { select: { id: true, company: true, email: true, archivedAt: true } },
        payments: { select: { amount: true, type: true } },
      },
    });

    const leadIds = projects.map((p) => p.convertedFromLeadId).filter((id): id is string => Boolean(id));
    const leads = leadIds.length
      ? await prisma.lead.findMany({
          where: { id: { in: leadIds }, agreementSignedAt: { not: null } },
          select: {
            id: true,
            company: true,
            agreementSignedAt: true,
            agreementSignerName: true,
            signedContractUrl: true,
          },
        })
      : [];
    const byLeadId = new Map(leads.map((l) => [l.id, l]));

    const records = projects.flatMap((project) => {
      const lead = project.convertedFromLeadId ? byLeadId.get(project.convertedFromLeadId) : undefined;
      if (!lead) return [];
      return [
        {
          clientId: project.client.id,
          projectId: project.id,
          company: project.client.company || lead.company,
          projectName: project.name,
          signerName: lead.agreementSignerName,
          signedAt: lead.agreementSignedAt,
          paidLabel: formatCents(amountPaidTowardProject(project.payments)),
          archived: Boolean(project.client.archivedAt),
          // Signatures taken before the executed-copy bug was fixed have no
          // document behind them. Flagged rather than hidden — a thinner
          // certificate is still the record, and you want to know which
          // ones are thin before somebody asks.
          hasExecutedCopy: Boolean(lead.signedContractUrl),
        },
      ];
    });

    return NextResponse.json({ success: true, records }, { status: 200 });
  } catch (error) {
    console.error('Signature records error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
