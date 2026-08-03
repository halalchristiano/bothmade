import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { splitNotificationId } from '../route';

/** How long each snooze option puts an item away for. */
const SNOOZE_DURATIONS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  tomorrow: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Read, dismiss, or snooze one derived notification.
 *
 * The item itself is not stored — it is re-derived on every GET — so this
 * writes only the per-user state, keyed on the (kind, subjectId) pair the
 * derived id splits into. Upsert, because the first interaction with an
 * item is what creates its state row.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { notificationId } = await params;
    const { action, duration } = await request.json();

    if (!['read', 'unread', 'dismiss', 'restore', 'snooze'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be one of: read, unread, dismiss, restore, snooze' },
        { status: 400 }
      );
    }

    const { kind, subjectId } = splitNotificationId(notificationId);
    if (!kind) {
      return NextResponse.json({ error: 'Unrecognised notification' }, { status: 400 });
    }

    const now = new Date();
    let snoozedUntil: Date | null = null;

    if (action === 'snooze') {
      const ms = SNOOZE_DURATIONS[String(duration)];
      if (!ms) {
        return NextResponse.json(
          { error: `duration must be one of: ${Object.keys(SNOOZE_DURATIONS).join(', ')}` },
          { status: 400 }
        );
      }
      snoozedUntil = new Date(now.getTime() + ms);
    }

    const state = {
      // Snoozing something implies you've seen it.
      readAt: action === 'unread' ? null : now,
      dismissedAt: action === 'dismiss' ? now : action === 'restore' ? null : undefined,
      snoozedUntil: action === 'snooze' ? snoozedUntil : action === 'restore' ? null : undefined,
    };

    await prisma.notification.upsert({
      where: {
        userId_kind_subjectType_subjectId: {
          userId: session.userId,
          kind,
          subjectType: 'derived',
          subjectId,
        },
      },
      update: state,
      create: {
        userId: session.userId,
        kind,
        subjectType: 'derived',
        subjectId,
        // Derived items carry their own copy; these exist so the row is
        // self-describing if it is ever read outside that flow.
        title: kind,
        severity: 'normal',
        readAt: state.readAt,
        dismissedAt: state.dismissedAt ?? null,
        snoozedUntil: state.snoozedUntil ?? null,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Update notification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
