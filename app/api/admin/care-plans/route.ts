import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { serializeOffer } from '@/lib/care-offers';
import { monthlyRateCents, parseRecurringAddOns, planLabel } from '@/lib/recurring';
import { ADD_ONS } from '@/lib/pricing';

/**
 * Every live project with where its monthly care plan stands.
 *
 * This exists because the upsell has a window: it lands when the build is
 * nearly done and the client can see what they're about to be handed, and it
 * gets much harder a month after handover when nobody's talking. A list nobody
 * has to remember to check is the difference between "we should sell hosting"
 * and actually selling it.
 *
 * Open to all staff, and reachable from the sales nav — unlike the rest of the
 * project surface, which the nav withholds. It carries no project files, no
 * client contact details and no revenue figures; just what each project's
 * ongoing plan is doing.
 */
export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const projects = await prisma.project.findMany({
      where: { client: { archivedAt: null } },
      orderBy: [{ statusStage: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        status: true,
        statusStage: true,
        addOns: true,
        updatedAt: true,
        client: { select: { company: true } },
        recurringOffers: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { payments: { orderBy: { createdAt: 'desc' } } },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        projects: projects.map((project) => {
          const inScope = parseRecurringAddOns(project.addOns);
          const latest = project.recurringOffers[0];

          return {
            id: project.id,
            name: project.name,
            company: project.client.company,
            status: project.status,
            statusStage: project.statusStage,
            // What they took at the start — the difference between "their
            // included months are running out" and a cold upsell.
            inScope: inScope.map((key) => ADD_ONS[key].label),
            inScopeLabel: inScope.length > 0 ? planLabel(inScope) : null,
            // What the plan would be worth per month if they signed onto
            // everything already in their scope. Zero means the pitch has to
            // start from the catalogue instead.
            monthlyPotential: monthlyRateCents(inScope),
            offer: latest ? serializeOffer(latest) : null,
            updatedAt: project.updatedAt.toISOString(),
          };
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Care plans list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
