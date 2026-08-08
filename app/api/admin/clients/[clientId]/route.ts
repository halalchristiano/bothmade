import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { accountingHold } from '@/lib/deletion-guards';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const client = await prisma.client.findUnique({
      where: { id: (await params).clientId },
      include: {
        projects: {
          orderBy: { createdAt: 'desc' },
          include: { payments: { select: { id: true } } },
        },
        emailPreferences: true,
      },
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Which projects can actually produce a signature certificate — worked
    // out here rather than in the page, so the button only appears where
    // pressing it returns a document instead of an explanation.
    const leadIds = client.projects.map((p) => p.convertedFromLeadId).filter((id): id is string => Boolean(id));
    const signedLeads = leadIds.length
      ? await prisma.lead.findMany({
          where: { id: { in: leadIds }, agreementSignedAt: { not: null } },
          select: { id: true, agreementSignedAt: true, agreementSignerName: true },
        })
      : [];
    const byLeadId = new Map(signedLeads.map((l) => [l.id, l]));

    const signatureRecords = client.projects.flatMap((project) => {
      const lead = project.convertedFromLeadId ? byLeadId.get(project.convertedFromLeadId) : undefined;
      if (!lead || project.payments.length === 0) return [];
      return [
        {
          projectId: project.id,
          projectName: project.name,
          signedAt: lead.agreementSignedAt,
          signerName: lead.agreementSignerName,
        },
      ];
    });

    return NextResponse.json(
      {
        success: true,
        client: {
          id: client.id,
          email: client.email,
          company: client.company,
          phone: client.phone,
          contactName: client.contactName,
          onboardingComplete: client.onboardingComplete,
          lastLoginAt: client.lastLoginAt,
          archivedAt: client.archivedAt,
          createdAt: client.createdAt,
          projects: client.projects.map(({ payments, ...project }) => ({
            ...project,
            paymentCount: payments.length,
          })),
          emailPreferences: client.emailPreferences,
          signatureRecords,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get client error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const { company, phone, contactName, archived } = await request.json();

    const existing = archived !== undefined ? await prisma.client.findUnique({ where: { id: (await params).clientId } }) : null;

    const client = await prisma.client.update({
      where: { id: (await params).clientId },
      data: {
        company: company || undefined,
        phone: phone !== undefined ? phone : undefined,
        contactName: contactName !== undefined ? contactName : undefined,
        archivedAt: archived === true ? new Date() : archived === false ? null : undefined,
      },
    });

    if (archived === true && existing && !existing.archivedAt) {
      await prisma.teamMessage.create({
        data: {
          content: `📦 ${client.company} was decommissioned.`,
          fromUserId: session.userId,
        },
      });
    }

    return NextResponse.json({ success: true, client }, { status: 200 });
  } catch (error) {
    console.error('Update client error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const { clientId } = await params;
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, company: true, _count: { select: { invoices: true, projects: true } } },
    });
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    /*
     * The confirmation, on the server, where it is worth something.
     *
     * The client page asks for the company name typed out and disables its
     * own button until it matches — and that was the entire guard. The route
     * itself accepted a bare `DELETE /api/admin/clients/<id>`, no body, no
     * question asked, and cascaded away every project, message, onboarding
     * answer, payment and invoice the client had. A mistyped fetch in a
     * console, a stale tab, a script written against the API, anything that
     * was not that one disabled button, deleted the lot.
     *
     * Which also made this the way around the guard on projects: the project
     * that refuses to delete because money is recorded against it deletes
     * fine, with the money, if you delete its client instead.
     */
    const body = await request.json().catch(() => null);
    const typed = typeof body?.confirm === 'string' ? body.confirm.trim() : '';

    // Case-insensitive, because the point is proving you know which client
    // this is, not proving you can match capitalisation.
    if (typed.toLowerCase() !== client.company.trim().toLowerCase()) {
      return NextResponse.json(
        { error: `Type "${client.company}" exactly to confirm.` },
        { status: 400 }
      );
    }

    /*
     * The same accounting rule the project delete enforces, applied to the
     * cascade that would otherwise swallow it whole. Payments hang off
     * projects rather than off the client, so they are counted across them.
     */
    const payments = await prisma.payment.count({ where: { project: { clientId } } });
    const hold = accountingHold(client.company, { payments, invoices: client._count.invoices });
    if (hold) {
      return NextResponse.json({ error: hold }, { status: 409 });
    }

    // Permanently removes the client and, via cascade, every project, message,
    // and onboarding record tied to it. Decommissioning (PATCH
    // {archived:true}) is the reversible option — this is not.
    await prisma.client.delete({ where: { id: clientId } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete client error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
