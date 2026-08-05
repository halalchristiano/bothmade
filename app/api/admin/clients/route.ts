import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { PROJECT_SCOPE_PAYMENT_TYPES } from '@/lib/billing';

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const clients = await prisma.client.findMany({
      include: {
        projects: true,
        emailPreferences: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Health signal: days since the most recent activity (message or project
    // update) across any of the client's projects — lets Kiana spot clients
    // who've gone quiet at a glance.
    const safeClients = await Promise.all(
      clients.map(async (client) => {
        const projectIds = client.projects.map((p) => p.id);
        let lastActivityAt: Date | null = null;
        /**
         * When they first actually paid — which is not the same as when the
         * record appeared.
         *
         * A client is usually created by a completed checkout, so the two
         * dates match. But a project created by hand at /admin/projects/new
         * creates the client too, with no money involved, so `createdAt`
         * alone cannot answer "has this person ever paid us?". Null means
         * they haven't, and that is worth seeing on this page.
         */
        let firstPaidAt: Date | null = null;
        if (projectIds.length > 0) {
          const [lastMessage, lastUpdate] = await Promise.all([
            prisma.projectMessage.findFirst({
              where: { projectId: { in: projectIds } },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            }),
            prisma.projectUpdate.findFirst({
              where: { projectId: { in: projectIds } },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            }),
          ]);
          const candidates = [lastMessage?.createdAt, lastUpdate?.createdAt].filter(Boolean) as Date[];
          lastActivityAt = candidates.length > 0 ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;

          const firstPayment = await prisma.payment.findFirst({
            where: {
              projectId: { in: projectIds },
              // Money against the project's own price. A one-off charge for
              // extra work is not what made them a customer.
              type: { in: [...PROJECT_SCOPE_PAYMENT_TYPES] },
            },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          });
          firstPaidAt = firstPayment?.createdAt ?? null;
        }

        return {
          id: client.id,
          email: client.email,
          company: client.company,
          phone: client.phone,
          contactName: client.contactName,
          subscription: client.subscription,
          subscriptionTier: client.subscriptionTier,
          onboardingComplete: client.onboardingComplete,
          archivedAt: client.archivedAt,
          createdAt: client.createdAt,
          firstPaidAt,
          projects: client.projects,
          lastActivityAt,
        };
      })
    );

    return NextResponse.json(
      { success: true, clients: safeClients },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get clients error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
