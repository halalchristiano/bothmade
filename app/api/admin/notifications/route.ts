import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { requireRole, ANY_STAFF } from '@/lib/authz';
import { unauthorizedResponse } from '@/lib/middleware';
import { ACTIVE_LEAD_STATUSES } from '@/lib/leads';

export interface NotificationItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  severity: 'info' | 'warning' | 'urgent';
}

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const staleThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const items: NotificationItem[] = [];

    // Unread casual messages disappear once read; flagged (urgent) ones stay
    // until explicitly marked resolved, regardless of read status.
    const [unreadMessages, unresolvedFlags] = await Promise.all([
      prisma.teamMessage.findMany({
        where: {
          readAt: null,
          urgent: false,
          fromUserId: { not: session.userId },
          OR: [{ toUserId: session.userId }, { toUserId: null }],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { fromUser: { select: { name: true, email: true } } },
      }),
      prisma.teamMessage.findMany({
        where: {
          urgent: true,
          resolved: false,
          fromUserId: { not: session.userId },
          OR: [{ toUserId: session.userId }, { toUserId: null }],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { fromUser: { select: { name: true, email: true } } },
      }),
    ]);
    for (const m of unreadMessages) {
      items.push({
        id: `msg-${m.id}`,
        label: `${m.fromUser.name || m.fromUser.email} messaged you`,
        detail: m.content.slice(0, 80),
        href: '/admin/team-chat',
        severity: 'info',
      });
    }
    for (const m of unresolvedFlags) {
      items.push({
        id: `flag-${m.id}`,
        label: `🚩 ${m.fromUser.name || m.fromUser.email} needs a response`,
        detail: m.content.slice(0, 80),
        href: '/admin/team-chat',
        severity: 'urgent',
      });
    }

    // Follow-ups due/overdue — relevant to sales.
    const dueLeads = await prisma.lead.findMany({
      where: {
        status: { in: [...ACTIVE_LEAD_STATUSES] },
        nextFollowUpAt: { lt: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000) },
        OR: [{ assignedToId: session.userId }, { assignedToId: null }],
      },
      orderBy: { nextFollowUpAt: 'asc' },
      take: 10,
    });
    for (const l of dueLeads) {
      const overdue = l.nextFollowUpAt && l.nextFollowUpAt < startOfToday;
      items.push({
        id: `followup-${l.id}`,
        label: `Follow up: ${l.company}`,
        detail: overdue ? 'Overdue' : 'Due today',
        href: `/admin/leads/${l.id}`,
        severity: overdue ? 'urgent' : 'warning',
      });
    }

    // At-risk projects + overdue balances — relevant to owner/ops.
    const atRisk = await prisma.project.findMany({
      where: { status: { not: 'complete' }, updatedAt: { lt: staleThreshold } },
      include: { client: { select: { company: true } } },
      take: 10,
    });
    for (const p of atRisk) {
      items.push({
        id: `atrisk-${p.id}`,
        label: `${p.client.company} has gone quiet`,
        detail: `No update in ${Math.floor((now.getTime() - p.updatedAt.getTime()) / 86400000)} days`,
        href: `/admin/projects/${p.id}`,
        severity: 'warning',
      });
    }

    return NextResponse.json({ success: true, items, count: items.length }, { status: 200 });
  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
