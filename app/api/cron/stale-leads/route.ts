import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notifyAdminsStaleLeads } from '@/lib/notify';

const STALE_DAYS = 5;

/**
 * Runs daily via Vercel Cron (see vercel.json). Vercel signs its own cron
 * requests with this header — anyone else hitting this URL is rejected.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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

    return NextResponse.json({ success: true, staleCount: payload.length }, { status: 200 });
  } catch (error) {
    console.error('Stale leads digest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
