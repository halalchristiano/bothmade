import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { DOMAIN_ACCESS, LAUNCH_CHECKS, readChecklist } from '@/lib/launch';

/**
 * Everything about getting one project live, except the URL itself.
 *
 * Setting `liveUrl` stays where it was — on the project PATCH, behind the
 * send guard, because it is the thing that mails the client. This route is
 * the preparation: what we know about the domain, which checks are done, and
 * the two moments the contract asks us to record and nothing did.
 *
 * Nothing here emails anybody, deliberately. A route that both saves a
 * checkbox and might send a message is a route people stop pressing.
 */

const MAX_NOTE = 2000;

function text(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        launchChecklist: true,
        readyForLaunchAt: true,
        handoverAt: true,
        // Section 7's gate on the handover below. By index rather than array
        // position — see finalInstalment() for what the positional read did
        // to this same gate on the launch board.
        instalments: { select: { index: true, status: true, label: true } },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'That project no longer exists.' }, { status: 404 });
    }

    const data: Prisma.ProjectUpdateInput = {};

    if (body.domainName !== undefined) {
      // Stored as a hostname, not a URL. Somebody will paste
      // "https://havis.co.uk/" out of a browser, and a domain with a scheme
      // and a trailing slash on it stops matching anything we compare it to.
      const raw = text(body.domainName, 253);
      data.domainName = raw
        ? raw
            .replace(/^https?:\/\//i, '')
            .replace(/\/.*$/, '')
            .toLowerCase()
        : null;
    }
    if (body.domainRegistrar !== undefined) data.domainRegistrar = text(body.domainRegistrar);
    if (body.hostingProvider !== undefined) data.hostingProvider = text(body.hostingProvider);
    if (body.dnsNote !== undefined) data.dnsNote = text(body.dnsNote, MAX_NOTE);
    if (body.domainAccess !== undefined) {
      const value = text(body.domainAccess, 40);
      data.domainAccess = DOMAIN_ACCESS.some((d) => d.value === value) ? value : null;
    }

    /*
     * One check at a time, merged into what is already stored.
     *
     * Sending the whole checklist would mean two people ticking two different
     * boxes on the same project untick each other's — which is exactly the
     * shape of bug nobody reports, because the box just quietly comes back.
     */
    if (body.check !== undefined) {
      const key = text(body.check, 60);
      if (!key || !LAUNCH_CHECKS.some((c) => c.key === key)) {
        return NextResponse.json({ error: 'That is not one of the launch checks.' }, { status: 400 });
      }
      const checklist = readChecklist(project.launchChecklist);
      const done = body.done === true;
      // Who ticked it, by name. The JWT carries an email and a role and not a
      // name, and "kiana@bothmade.studio confirmed the forms work" reads like
      // a log line rather than a person taking responsibility for it.
      const actor =
        (
          await prisma.user
            .findUnique({ where: { id: session.userId }, select: { name: true } })
            .catch(() => null)
        )?.name || session.email;
      checklist[key] = done
        ? {
            done: true,
            at: new Date().toISOString(),
            by: actor,
            note: text(body.note, 500) ?? undefined,
          }
        : // Unticked rather than deleted, so the record still says somebody
          // looked at it and decided it was not done.
          { done: false, at: new Date().toISOString(), by: actor };
      data.launchChecklist = checklist as unknown as Prisma.InputJsonValue;
    }

    /*
     * "Ready for Launch", as Section 1 defines it.
     *
     * The definition is a state the Agency "has confirmed in writing through
     * the dashboard" — so there had to be somewhere to confirm it, and until
     * now there was not. It is also what makes Payment 3 due under Section 7,
     * which is why it is a deliberate act with a date on it rather than a
     * side effect of moving a dropdown.
     */
    if (body.readyForLaunch !== undefined) {
      data.readyForLaunchAt = body.readyForLaunch === true ? new Date() : null;
    }

    /*
     * Exhibit A: handover of credentials, source and documentation is part of
     * the Launch phase. This records the moment it actually happened.
     *
     * And Section 7 is checked here rather than only described on the page.
     * "Nothing goes live, no files or source transfer, no credentials hand
     * over, and no intellectual property assigns until it has cleared" is the
     * one clause in the agreement that names the handover specifically, and
     * marking it done writes a line onto the CLIENT's own timeline saying the
     * accounts and the intellectual property have transferred to them in
     * full. That sentence is the thing a client would later rely on, and it
     * could be published while their final invoice was still outstanding.
     *
     * The page did warn — a paragraph of grey text under the button — but a
     * warning next to a control is not the same as a check inside the thing
     * that acts. Named rather than forbidden, as everywhere else here: a
     * handover that genuinely has to happen early still happens, on a second
     * deliberate press rather than the one that records a routine one.
     */
    if (body.handedOver === true && project.handoverAt === null) {
      const live = project.instalments.filter((i) => i.status !== 'void');
      const finalRow = live.length
        ? live.reduce((latest, row) => (row.index > latest.index ? row : latest))
        : null;
      if (finalRow && finalRow.status !== 'paid' && body.acknowledgeUnpaid !== true) {
        return NextResponse.json(
          {
            error: `${finalRow.label} has not cleared. Section 7 holds the transfer of files, credentials and intellectual property until it does — and marking this done tells the client on their own timeline that all three are theirs.`,
            finalInstalmentUnpaid: true,
          },
          { status: 409 }
        );
      }
    }
    if (body.handedOver !== undefined) {
      data.handoverAt = body.handedOver === true ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
    }

    const updated = await prisma.project.update({ where: { id: projectId }, data });

    // The two contractual moments go on the timeline the client reads. A
    // confirmation made "in writing through the dashboard" that appears on no
    // dashboard is not much of a confirmation.
    if (body.readyForLaunch === true && !project.readyForLaunchAt) {
      await prisma.projectUpdate
        .create({
          data: {
            projectId,
            title: 'Ready for launch',
            description:
              'Everything is built, checked and ready to go live. The final invoice follows, and we launch as soon as it clears — the finished site is on the preview environment for you to look at in the meantime.',
            statusStage: updated.status,
            userId: session.userId,
          },
        })
        .catch((e) => console.error('Ready-for-launch update not written:', e));
    }
    if (body.handedOver === true && !project.handoverAt) {
      await prisma.projectUpdate
        .create({
          data: {
            projectId,
            title: 'Everything handed over',
            description:
              'Credentials, source and documentation are yours. The site, the accounts and the intellectual property in what we built all transfer to you in full.',
            statusStage: updated.status,
            userId: session.userId,
          },
        })
        .catch((e) => console.error('Handover update not written:', e));
    }

    return NextResponse.json({ success: true, project: updated }, { status: 200 });
  } catch (error) {
    console.error('Deployment update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
