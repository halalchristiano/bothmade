import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { mockupInclude, mockupSignal, toMockupDTO } from '@/lib/mockups';

/**
 * Every lead waiting on a mockup, oldest request first — the dashboard widget
 * only ever showed the top few, so a request could sit past that window
 * without anyone noticing it had slipped.
 *
 * Returns the design brief alongside the request, not just who asked and
 * when. The lead already holds their current site, a written verdict on
 * what's wrong with it, the problems found and the exact list of things the
 * rep is selling — all of it surfaced to the rep and none of it to the person
 * who has to build the thing. A mockup exists to make one specific promise
 * look real, so what it has to demonstrate is the sales pitch.
 */
export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    /*
     * "Built" means the client folder exists. Nothing else does.
     *
     * A preview deployment is not a deliverable — it is a password-protected
     * subdomain we look at. Counting it as produced work put leads with a
     * concept and no folder on the Built tab, reading "13 built" when the
     * brochure and video had not been assembled for any of them. The work
     * left to do is the folder, so the folder is what decides the column.
     *
     * The `mockupUrl` half of the OR catches leads that were never formally
     * requested but already have a concept standing — those need a folder
     * too, and previously appeared on neither tab.
     */
    const leads = await prisma.lead.findMany({
      where: {
        mockupFolderUrl: null,
        OR: [{ mockupRequested: true }, { mockupUrl: { not: null } }],
      },
      orderBy: { mockupRequestedAt: 'asc' },
      select: {
        id: true,
        company: true,
        contactName: true,
        mockupRequestedAt: true,
        hotLead: true,
        // So a row can say "concept exists, folder still needed".
        mockupUrl: true,
        assignedTo: { select: { name: true } },
        // The brief.
        painPoints: true,
        salesNote: true,
        originalWebsite: true,
        currentSiteAssessment: true,
        customPainPoints: true,
        essentialPoints: true,
        estimateLowCents: true,
        estimateHighCents: true,
        estimatedValue: true,
      },
    });

    // The other half of a page called "Mockups": the ones already out with
    // clients. Until now this screen only listed work to be built, so the
    // moment a mockup was delivered it left the only page named after it and
    // whether anyone had opened it was nobody's screen.
    const live = await prisma.leadMockup
      .findMany({
        // Only versions belonging to a lead that has a client folder. A
        // mockup row created back when the preview link *was* the mockup is
        // history, not a deliverable — its lead still needs a folder built,
        // so it belongs on the other tab.
        //
        // Drafts are included deliberately: attaching a folder takes the
        // lead off the build queue, and filtering drafts out here too would
        // leave a built-but-unsent mockup on neither tab, at the exact
        // moment somebody needed to send it.
        where: { lead: { mockupFolderUrl: { not: null } } },
        orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
        take: 60,
        include: {
          ...mockupInclude,
          // Both links and the address, so the two slots and the send
          // control can live on this page rather than only on the lead.
          lead: {
            select: {
              id: true,
              company: true,
              contactName: true,
              status: true,
              estimatedValue: true,
              email: true,
              mockupUrl: true,
              mockupFolderUrl: true,
            },
          },
        },
      })
      .catch((err) => {
        // Pre-migration deploys have no status column. Losing the new panel
        // is survivable; losing the queue this page has always had is not.
        console.error('Live mockups unavailable, serving the build queue alone:', err);
        return [];
      });

    return NextResponse.json(
      {
        success: true,
        leads,
        live: live.map((m) => ({
          ...toMockupDTO(m),
          signal: mockupSignal(toMockupDTO(m)),
          lead: m.lead,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Mockup queue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
