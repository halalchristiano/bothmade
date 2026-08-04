import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { amountPaidTowardProject } from '@/lib/billing';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
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
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const staleThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const items: NotificationItem[] = [];

    // Unread casual messages disappear once read; flagged (urgent) ones stay
    // until explicitly marked resolved, regardless of read status.
    // Read state comes from the per-user teamChatReadAt, not the message's own
    // readAt. readAt is only ever stamped on messages addressed to someone
    // (toUserId = my id), and a broadcast is addressed to nobody — so keying
    // off it left every broadcast sitting in this list permanently, for
    // everyone, including whoever had just read it.
    const reader = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { teamChatReadAt: true },
    });

    const [unreadMessages, unresolvedFlags] = await Promise.all([
      prisma.teamMessage.findMany({
        where: {
          urgent: false,
          fromUserId: { not: session.userId },
          OR: [{ toUserId: session.userId }, { toUserId: null }],
          ...(reader?.teamChatReadAt ? { createdAt: { gt: reader.teamChatReadAt } } : {}),
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

    // Leads who wrote back — the call list already surfaces these at the top,
    // but that only helps if he's on that page. The bell follows him
    // everywhere else too.
    const repliedLeads = await prisma.lead.findMany({
      where: {
        replyReceivedAt: { not: null },
        status: { in: [...ACTIVE_LEAD_STATUSES] },
        OR: [{ assignedToId: session.userId }, { assignedToId: null }],
      },
      orderBy: { replyReceivedAt: 'desc' },
      take: 10,
    });
    for (const l of repliedLeads) {
      items.push({
        id: `reply-${l.id}`,
        label: `${l.company} wrote back`,
        detail: 'Ring these first',
        href: `/admin/leads/${l.id}`,
        severity: 'urgent',
      });
    }

    // Follow-ups due/overdue — relevant to sales. Excludes leads already
    // flagged above as "wrote back" — same mutual-exclusivity the call list
    // uses, so the same lead doesn't ping twice for two reasons at once.
    const dueLeads = await prisma.lead.findMany({
      where: {
        status: { in: [...ACTIVE_LEAD_STATUSES] },
        replyReceivedAt: null,
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

    const activeProjects = await prisma.project.findMany({
      where: { status: { not: 'complete' } },
      select: { id: true, totalPrice: true, client: { select: { company: true } }, payments: { select: { amount: true, type: true } } },
      take: 40,
    });
    for (const p of activeProjects) {
      const balanceDue = p.totalPrice - amountPaidTowardProject(p.payments);
      if (balanceDue <= 0) continue;
      items.push({
        id: `overdue-${p.id}`,
        label: `${p.client.company} has an outstanding balance`,
        detail: `${(balanceDue / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })} due`,
        href: `/admin/projects/${p.id}`,
        severity: 'urgent',
      });
    }

    return NextResponse.json({ success: true, items, count: items.length }, { status: 200 });
  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
