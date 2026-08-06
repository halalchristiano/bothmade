import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import {
  clientMockupLink,
  MOCKUPS_TO_BUILD_WHERE,
  mockupInclude,
  mockupSignal,
  toMockupDTO,
} from '@/lib/mockups';

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
      where: MOCKUPS_TO_BUILD_WHERE,
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

    /*
     * The other half of a page called "Mockups": the ones already out with
     * clients. Until now this screen only listed work to be built, so the
     * moment a mockup was delivered it left the only page named after it and
     * whether anyone had opened it was nobody's screen.
     *
     * One card per *lead*, not per version — which is the fix for a list that
     * had started reading like a bug. A lead collects a version for its
     * preview build, another for the client folder, another again for a PDF
     * export, and this tab listed each of them, so the same business appeared
     * two and three times over with nothing on the card saying why. Two
     * "Havis" rows side by side do not look like two versions of one mockup;
     * they look like the system has lost track of who Havis is.
     *
     * Only leads that have a client folder. A mockup row from back when the
     * preview link *was* the mockup is history, not a deliverable — its lead
     * still needs a folder built, so it belongs on the other tab.
     *
     * Drafts are included deliberately: attaching a folder takes the lead off
     * the build queue, and filtering drafts out here too would leave a
     * built-but-unsent mockup on neither tab, at the exact moment somebody
     * needed to send it.
     */
    const built = await prisma.lead
      .findMany({
        where: { mockupFolderUrl: { not: null } },
        orderBy: { mockupDeliveredAt: { sort: 'desc', nulls: 'last' } },
        take: 60,
        select: {
          id: true,
          company: true,
          contactName: true,
          status: true,
          estimatedValue: true,
          email: true,
          mockupUrl: true,
          mockupFolderUrl: true,
          mockupSentManuallyAt: true,
          // Only whether there is one — the panel says which wording is
          // about to go out, and the text itself belongs in the preview.
          mockupEmailDraft: true,
          mockups: { orderBy: { createdAt: 'asc' }, include: mockupInclude },
        },
      })
      .catch((err) => {
        // Pre-migration deploys have no status column. Losing the new panel
        // is survivable; losing the queue this page has always had is not.
        console.error('Live mockups unavailable, serving the build queue alone:', err);
        return [];
      });

    /*
     * Which version speaks for the lead.
     *
     * The folder one, when it exists — that is the link the send button on
     * this page actually mails, so its send state is the state the card is
     * reporting on. Otherwise the most recently touched version, because that
     * is where the story currently is. Picking by "most urgent" instead would
     * put a superseded draft's "not sent yet" on a lead whose newer version
     * went out this morning.
     */
    const live = built.map((lead) => {
      const { mockups, ...leadFields } = lead;
      const versions = mockups.map(toMockupDTO);
      const folderLink = clientMockupLink(lead);
      const byRecency = [...versions].sort(
        (a, b) =>
          new Date(b.sentAt ?? b.uploadedAt).getTime() - new Date(a.sentAt ?? a.uploadedAt).getTime()
      );
      const representative =
        (folderLink ? versions.find((v) => v.url === folderLink) : undefined) ?? byRecency[0];

      // A folder attached without a version row ever being written — that
      // recording is best-effort and swallows its own errors — used to land
      // the lead on neither tab. The card is about the lead and the send
      // works off the lead, so it can be shown honestly with nothing behind
      // it rather than disappearing.
      if (!representative) {
        return {
          ...toMockupDTO({
            id: `lead-${lead.id}`,
            url: folderLink ?? '',
            fileName: null,
            note: '',
            createdAt: new Date(),
          }),
          signal: 'Not sent to the client yet',
          versionCount: 0,
          lead: leadFields,
        };
      }

      return {
        ...representative,
        signal: mockupSignal(representative),
        // Said on the card, so a lead with a history reads as one business
        // with several versions rather than as several businesses.
        versionCount: versions.length,
        lead: leadFields,
      };
    });

    return NextResponse.json({ success: true, leads, live }, { status: 200 });
  } catch (error) {
    console.error('Mockup queue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
