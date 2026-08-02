import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notifyAdminsStaleLeads } from '@/lib/notify';
import { syncBouncesForAllUsers } from '@/lib/bounce-sync';

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

    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

    const staleLeads = await prisma.lead.findMany({
      where: {
        status: { notIn: ['won', 'lost'] },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, company: true, updatedAt: true },
    });

    const payload = staleLeads.map((l) => ({
      id: l.id,
      company: l.company,
      daysSinceActivity: Math.floor((Date.now() - l.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
    }));

    await notifyAdminsStaleLeads(payload);

    return NextResponse.json(
      { success: true, staleCount: payload.length, bouncesFlagged: bounces.flagged },
      { status: 200 }
    );
  } catch (error) {
    console.error('Stale leads digest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
