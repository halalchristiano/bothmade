import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { projectBalance } from '@/lib/billing';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ACTIVE_LEAD_STATUSES } from '@/lib/leads';
import { unreadWhere } from '@/lib/team-chat';
import { autoFollowUpSender } from '@/lib/auto-follow-up';
import { autoFollowUpBlocker } from '@/lib/outreach-health';

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

    const unread = unreadWhere(session.userId, reader?.teamChatReadAt ?? null);

    const [unreadMessages, unresolvedFlags] = await Promise.all([
      prisma.teamMessage.findMany({
        // The shared predicate, at last. lib/team-chat says it exists because
        // this clause was "hand-copied (with the same explanatory comment)
        // across the list route, the unread-count route, and the
        // notifications bell" — and then two of the three were changed over
        // and this one was left holding its own copy. A badge counted by one
        // predicate over a list built by another is a badge that can be
        // right about a number nobody can find.
        where: { ...unread, urgent: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, content: true, kind: true, fromUser: { select: { name: true, email: true } } },
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
        select: { id: true, content: true, kind: true, fromUser: { select: { name: true, email: true } } },
      }),
    ]);

    /*
     * Who, if anybody, actually said this.
     *
     * A `kind: 'system'` row is the app narrating — a client approved their
     * mockup, a cold email was opened, a payment landed. It still carries a
     * fromUserId because the schema wants an author and a cascade anchor,
     * and postSystemMessage fills that in with the related lead's owner or,
     * failing that, whichever staff account findFirst returned. The chat
     * itself knows this and draws those rows as a centred timeline entry
     * rather than a speech bubble; the bell did not, and read the same
     * column as though it were a sender.
     *
     * So the bell announced "🚩 Kiana needs a response" over a client
     * approving a mockup — naming somebody who did nothing, about a message
     * they never wrote, and asking for a reply nobody is waiting on. The
     * thing actually waiting is a proposal.
     */
    const said = (m: { kind: string; fromUser: { name: string | null; email: string } }) =>
      m.kind === 'system' ? null : m.fromUser.name || m.fromUser.email;

    for (const m of unreadMessages) {
      const who = said(m);
      items.push({
        id: `msg-${m.id}`,
        label: who ? `${who} messaged you` : 'New in team chat',
        detail: m.content.slice(0, 80),
        href: '/admin/team-chat',
        severity: 'info',
      });
    }
    for (const m of unresolvedFlags) {
      const who = said(m);
      items.push({
        id: `flag-${m.id}`,
        // "Needs a response" is about a person waiting on you. Nobody is
        // waiting on a reply to an automated row — what it is flagging is
        // work, and it says what the work is in the line underneath.
        label: who ? `🚩 ${who} needs a response` : '🚩 Flagged in team chat',
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
      select: {
        id: true,
        totalPrice: true,
        statusStage: true,
        client: { select: { company: true } },
        payments: { select: { amount: true, type: true } },
        instalments: { select: { status: true, amountCents: true, trigger: true } },
      },
      take: 40,
    });
    for (const p of activeProjects) {
      // Invoiced and unpaid — not "hasn't finished paying the contract". With
      // a three-instalment schedule the second reading is true of every live
      // project, which turned this bell into a permanent one.
      const balanceDue = projectBalance(p).dueNowCents;
      if (balanceDue <= 0) continue;
      items.push({
        id: `overdue-${p.id}`,
        label: `${p.client.company} has an outstanding balance`,
        detail: `${(balanceDue / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })} due`,
        href: `/admin/projects/${p.id}`,
        severity: 'urgent',
      });
    }

    /*
     * The cron that cannot start.
     *
     * /api/cron/auto-follow-up refuses to run when no account holds the
     * outreach mailbox, and says so clearly — into Vercel's cron log, which
     * nobody opens. So it can decline every weekday for weeks while the
     * sequence silently stops advancing, and the only symptom is leads who
     * were spoken to on the phone never hearing back.
     *
     * Same lookup the cron does, by gmailAddress OR email, so the two cannot
     * disagree about whether it is configured.
     *
     * Last in the list and deliberately not 'urgent': it is a setup task, not
     * a person waiting, and putting it above "they wrote back" would be
     * wrong every day it stayed unfixed.
     */
    const senderEmail = autoFollowUpSender();
    const senderAccount = await prisma.user.findFirst({
      where: { OR: [{ gmailAddress: senderEmail }, { email: senderEmail }] },
      select: {
        email: true,
        gmailAddress: true,
        gmailAppPassword: true,
        googleRefreshToken: true,
      },
    });

    const blocked = autoFollowUpBlocker(senderEmail, senderAccount);
    if (blocked) {
      items.push({
        id: `outreach-${blocked.reason}`,
        label: blocked.label,
        detail: blocked.detail,
        href: blocked.href,
        severity: 'warning',
      });
    }

    return NextResponse.json({ success: true, items, count: items.length }, { status: 200 });
  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
