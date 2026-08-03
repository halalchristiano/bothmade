import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notifyAdminsStaleLeads } from '@/lib/notify';
import { syncBouncesForAllUsers, syncRepliesForAllUsers } from '@/lib/bounce-sync';

const STALE_DAYS = 5;

// The bounce scan makes one Gmail call per notice, so this job needs longer
// than the default. Ignored on plans that cap it lower.
export const maxDuration = 60;

/**
 * Runs daily via Vercel Cron (see vercel.json). Vercel signs its own cron
 * requests with this header — anyone else hitting this URL is rejected.
 *
 * Also syncs bounced addresses, rather than taking its own cron slot: Vercel
 * caps a project's cron jobs, and a lead whose email bounced is the same kind
 * of problem this job already reports on — one nobody is going to notice
 * unaided. Runs first so anything it flags is reflected in the stale digest
 * and shows up at the top of the call list the same morning.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // One mailbox failing must not stop the stale-lead digest going out.
    let bounces = { flagged: 0, scanned: 0 };
    try {
      bounces = await syncBouncesForAllUsers();
    } catch (error) {
      console.error('Bounce sync failed during nightly job:', error);
    }

    let replies = { flagged: 0, scanned: 0 };
    try {
      replies = await syncRepliesForAllUsers();
    } catch (error) {
      console.error('Reply sync failed during nightly job:', error);
    }

    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

    const staleLeads = await prisma.lead.findMany({
      where: {
        status: { notIn: ['won', 'lost'] },
        updatedAt: { lt: cutoff },
        // A lead with a follow-up booked for next Tuesday is not neglected,
        // it is scheduled. Nagging about those every morning is how a digest
        // teaches people to ignore it, and then the genuinely dropped leads
        // go unnoticed too.
        OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lte: new Date() } }],
      },
      select: {
        id: true,
        company: true,
        updatedAt: true,
        assignedToId: true,
        assignedTo: { select: { id: true, email: true } },
      },
    });

    const toPayload = (l: (typeof staleLeads)[number]) => ({
      id: l.id,
      company: l.company,
      daysSinceActivity: Math.floor((Date.now() - l.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
    });

    // Send each rep their own list rather than mailing the whole team the
    // whole pipeline. A digest that is mostly somebody else's leads is a
    // digest nobody reads, and "everyone was told" is how a lead ends up
    // being nobody's problem. Unassigned leads have no owner to route to,
    // so they still go to everyone — that is exactly the case that needs a
    // human to claim it.
    const byAssignee = new Map<string, { email: string; leads: typeof staleLeads }>();
    const unassigned: typeof staleLeads = [];

    for (const lead of staleLeads) {
      if (lead.assignedTo?.email) {
        const bucket = byAssignee.get(lead.assignedTo.id) ?? {
          email: lead.assignedTo.email,
          leads: [],
        };
        bucket.leads.push(lead);
        byAssignee.set(lead.assignedTo.id, bucket);
      } else {
        unassigned.push(lead);
      }
    }

    for (const { email: assigneeEmail, leads } of byAssignee.values()) {
      await notifyAdminsStaleLeads(leads.map(toPayload), [assigneeEmail]);
    }
    if (unassigned.length > 0) {
      await notifyAdminsStaleLeads(unassigned.map(toPayload));
    }

    const payload = staleLeads.map(toPayload);

    return NextResponse.json(
      {
        success: true,
        staleCount: payload.length,
        bouncesFlagged: bounces.flagged,
        repliesFlagged: replies.flagged,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Stale leads digest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
