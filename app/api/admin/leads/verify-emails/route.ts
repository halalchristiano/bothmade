import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import {
  VERIFY_BATCH_SIZE,
  isSendableStatus,
  isVerificationConfigured,
  remainingCredits,
  verifyBatch,
} from '@/lib/email-verification';

/*
 * The verifier takes up to 70 seconds for a full batch and this route exists
 * to run one, so the platform default would kill it partway through.
 */
export const maxDuration = 300;

/**
 * Check a block of addresses that have never been checked.
 *
 * The sender verifies the batch it is about to send, which is enough to keep
 * a send safe but leaves the other seven hundred addresses unexamined until
 * the day they happen to be selected. This is how the backlog gets cleared
 * ahead of time: call it repeatedly and it works through the unverified
 * leads, oldest first, two hundred at a time.
 *
 * Deliberately not a queue or a cron. Verification costs a credit per address
 * and somebody should be choosing to spend them — a background job quietly
 * burning through a paid balance is a worse failure than a button pressed
 * five times.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    if (!isVerificationConfigured()) {
      return NextResponse.json(
        { error: 'Email verification is not set up — ZEROBOUNCE_API_KEY is missing.' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as { leadIds?: string[] };

    /*
     * Named leads if given, otherwise the oldest unverified with an address.
     *
     * `emailVerifiedAt: null` is the whole selector — a lead that has been
     * checked stays checked, because an address does not change between one
     * send and the next and every re-check is a credit spent for nothing.
     */
    const leads = await prisma.lead.findMany({
      where: {
        ...(body.leadIds?.length ? { id: { in: body.leadIds } } : {}),
        emailVerifiedAt: null,
        email: { not: null },
        doNotContact: false,
      },
      select: { id: true, email: true, company: true },
      orderBy: { createdAt: 'asc' },
      take: VERIFY_BATCH_SIZE,
    });

    if (leads.length === 0) {
      const remaining = await prisma.lead.count({
        where: { emailVerifiedAt: null, email: { not: null }, doNotContact: false },
      });
      return NextResponse.json({ success: true, checked: 0, remaining, done: remaining === 0 });
    }

    const results = await verifyBatch(leads.map((l) => l.email as string));

    const now = new Date();
    let good = 0;
    let bad = 0;
    let noVerdict = 0;

    await Promise.all(
      leads.map(async (lead) => {
        const r = results.get((lead.email as string).toLowerCase());
        // No verdict is not a verdict. Left unverified so it is picked up
        // again rather than recorded as something the provider never said.
        if (!r) {
          noVerdict++;
          return;
        }
        const sendable = isSendableStatus(r.status);
        sendable ? good++ : bad++;
        await prisma.lead
          .update({
            where: { id: lead.id },
            data: {
              emailVerifiedAt: now,
              emailVerificationStatus: r.status,
              emailVerificationSubStatus: r.subStatus,
              // Recorded exactly like a real bounce, so a dead address lands
              // in "can't reach" beside the others instead of inventing a
              // state the rest of the app does not understand.
              ...(sendable
                ? {}
                : {
                    emailDeliveryFailedAt: now,
                    emailDeliveryFailedReason: `Address verified as ${r.status}${
                      r.subStatus ? ` (${r.subStatus})` : ''
                    }. Nothing was sent — call instead.`,
                  }),
            },
          })
          .catch(() => null);
      })
    );

    const remaining = await prisma.lead.count({
      where: { emailVerifiedAt: null, email: { not: null }, doNotContact: false },
    });

    return NextResponse.json({
      success: true,
      checked: leads.length,
      good,
      bad,
      noVerdict,
      remaining,
      done: remaining === 0,
      credits: await remainingCredits(),
    });
  } catch (error) {
    console.error('Verify emails error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 502 }
    );
  }
}

/** How much is left to check, and whether it can be. */
export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const [unverified, verified] = await Promise.all([
      prisma.lead.count({ where: { emailVerifiedAt: null, email: { not: null }, doNotContact: false } }),
      prisma.lead.count({ where: { emailVerifiedAt: { not: null } } }),
    ]);

    return NextResponse.json({
      success: true,
      configured: isVerificationConfigured(),
      unverified,
      verified,
      credits: await remainingCredits(),
    });
  } catch (error) {
    console.error('Verify status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
