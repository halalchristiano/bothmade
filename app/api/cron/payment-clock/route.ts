import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cron-auth';
import { resolveSiteUrl } from '@/lib/site-url';
import { formatCentsExact } from '@/lib/pricing';
import { hasLapsed } from '@/lib/design-approval';
import { chaseState } from '@/lib/payment-chase';
import { sendPaymentChaseEmail } from '@/lib/email';
import { notifyAdminsDesignDeemedApproved, notifyAdminsPaymentNeedsCall } from '@/lib/notify';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

// Minting a fresh Stripe session per unpaid payment, one at a time.
export const maxDuration = 60;

/**
 * The clocks the contract runs, run daily.
 *
 * Two jobs, in one cron slot because Vercel caps how many a project gets and
 * because they are the same idea: things the agreement says happen on their
 * own, which the software previously needed a person to notice.
 *
 * FIRST, deemed approval. Section 4: "where the Client does not respond to
 * the presented design within the Review Period, Design Approval has
 * occurred ... including the second Instalment falling due." That is the one
 * clause where money becomes payable because of something a client DIDN'T
 * do, so nothing in the ordinary run of a day would ever surface it. The
 * review period lapses here, on its own, and the studio is told.
 *
 * SECOND, chasing. An invoice that went out and was never paid used to sit
 * silently, and its Stripe link died after 24 hours — so a client returning
 * to an older email found a dead button, which is a payment lost to friction
 * rather than to unwillingness. Every chase mints a fresh link and kills the
 * old one.
 *
 * Nothing here is sent before a payment is actually due. The contract gives
 * a client fourteen days and this respects them.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  const now = new Date();
  const result = { deemed: 0, chased: 0, callsFlagged: 0, failed: 0 };

  // --- 1. Review periods that have lapsed ---------------------------------
  try {
    const lapsing = await prisma.project.findMany({
      where: {
        designApprovedAt: null,
        designReviewEndsAt: { not: null, lte: now },
        status: { not: 'complete' },
      },
      select: {
        id: true,
        name: true,
        status: true,
        designPresentedAt: true,
        designReviewEndsAt: true,
        client: { select: { company: true } },
        instalments: {
          where: { trigger: 'design-approval' },
          select: { label: true, amountCents: true, status: true },
        },
      },
    });

    for (const project of lapsing) {
      const clock = {
        presentedAt: project.designPresentedAt,
        endsAt: project.designReviewEndsAt,
        approvedAt: null,
        deemed: false,
      };
      if (!hasLapsed(clock, now)) continue;

      await prisma.project.update({
        where: { id: project.id },
        data: { designApprovedAt: now, designApprovalDeemed: true },
      });

      // The client's own timeline says it too. Deemed approval that the
      // client never sees recorded is the kind of thing that gets disputed
      // later; written down on the day, it is simply what happened.
      await prisma.projectUpdate
        .create({
          data: {
            projectId: project.id,
            title: 'Design approved',
            description:
              "We didn't hear back on the design within the review period, so under Section 4 of your agreement it's approved and we've started building. If anything about it isn't right, tell us — we'd always rather hear it now than later.",
            statusStage: project.status,
            userId: null,
          },
        })
        .catch((error) => console.error(`Deemed approval timeline entry failed for ${project.id}:`, error));

      const unbilled = project.instalments.find((i) => i.status === 'scheduled');
      await notifyAdminsDesignDeemedApproved({
        projectId: project.id,
        projectName: project.name,
        company: project.client.company,
        presentedAt: project.designPresentedAt ?? now,
        paymentLabel: unbilled?.label ?? null,
        amountLabel: unbilled ? formatCentsExact(unbilled.amountCents) : null,
      }).catch((error) => console.error(`Deemed approval notify failed for ${project.id}:`, error));

      result.deemed++;
    }
  } catch (error) {
    console.error('Review clock failed:', error);
  }

  // --- 2. Invoiced, unpaid, and due for a chase ---------------------------
  try {
    const outstanding = await prisma.instalment.findMany({
      where: { status: 'due', invoicedAt: { not: null } },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: { select: { company: true, email: true, contactName: true, phone: true } },
          },
        },
      },
    });

    for (const inst of outstanding) {
      if (!inst.invoicedAt) continue;

      const state = chaseState({
        invoicedAt: inst.invoicedAt,
        dueAt: inst.dueAt,
        lastChasedAt: inst.lastChasedAt,
        chaseCount: inst.chaseCount,
        now,
        label: inst.label,
        amountLabel: formatCentsExact(inst.amountCents),
      });

      if (!state.shouldChase) continue;

      /**
       * A fresh link, and the old one killed.
       *
       * The order matters: mint first, then expire. Expiring first would
       * leave a client with no way to pay at all if Stripe then refused the
       * new session — a worse state than the stale link they had.
       */
      let paymentUrl: string | null = null;
      try {
        const siteUrl = resolveSiteUrl();
        const checkout = await stripe.checkout.sessions.create({
          mode: 'payment',
          success_url: `${siteUrl}/client/${inst.projectId}?paid=1`,
          cancel_url: `${siteUrl}/client/${inst.projectId}`,
          customer_email: inst.project.client.email,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: inst.amountCents,
                product_data: { name: `${inst.label} — ${inst.project.name}` },
              },
            },
          ],
          metadata: {
            existingProjectId: inst.projectId,
            instalmentId: inst.id,
            invoiceNumber: inst.invoiceNumber ?? '',
            paymentType: inst.index === 1 ? 'deposit' : 'balance',
          },
        });
        paymentUrl = checkout.url;

        if (inst.stripeSessionId && inst.stripeSessionId !== checkout.id) {
          await stripe.checkout.sessions
            .expire(inst.stripeSessionId)
            .catch(() => null); // already expired, already paid, or gone — all fine
        }

        await prisma.instalment.update({
          where: { id: inst.id },
          data: { stripeSessionId: checkout.id, paymentUrl: checkout.url },
        });
      } catch (error) {
        console.error(`Chase link failed for ${inst.id}:`, error);
        result.failed++;
        continue; // no working link means no chase — a dead button is the bug
      }

      if (!paymentUrl) {
        result.failed++;
        continue;
      }


      const sent = await sendPaymentChaseEmail({
        to: inst.project.client.email,
        contactName: inst.project.client.contactName,
        projectName: inst.project.name,
        label: inst.label,
        invoiceNumber: inst.invoiceNumber,
        amountLabel: formatCentsExact(inst.amountCents),
        subject: state.subject,
        line: state.line,
        dueLabel: (inst.dueAt ?? now).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        // Through our own domain, so the click is ours to see before Stripe's
        // — "never clicked" and "clicked and didn't finish" want completely
        // different responses from us. See app/pay/[instalmentId].
        paymentUrl: `${resolveSiteUrl()}/pay/${inst.id}`,
        seriouslyLate: state.phase === 'seriously-late',
        // The pixel too: a chase that never lands is the one case where
        // sending another one tomorrow is exactly the wrong move.
        instalmentId: inst.id,
      }).catch((error) => {
        console.error(`Chase email failed for ${inst.id}:`, error);
        return { sent: false };
      });

      if (!sent?.sent) {
        result.failed++;
        continue; // not counted as chased, so tomorrow's run tries again
      }

      await prisma.instalment.update({
        where: { id: inst.id },
        data: { lastChasedAt: now, chaseCount: { increment: 1 } },
      });
      result.chased++;

      /**
       * A week past due. The most valuable line this job produces: late B2B
       * payments are usually administrative — wrong contact, a PO number,
       * somebody away — and a four-minute call fixes all three where another
       * email fixes none.
       *
       * Sent once, on the crossing, rather than every week: an alert that
       * repeats becomes an alert that is ignored.
       */
      if (state.needsCall && inst.chaseCount + 1 === 3) {
        await notifyAdminsPaymentNeedsCall({
          projectId: inst.projectId,
          company: inst.project.client.company,
          contactName: inst.project.client.contactName,
          phone: inst.project.client.phone,
          label: inst.label,
          amountLabel: formatCentsExact(inst.amountCents),
          daysPastDue: state.daysPastDue,
          chaseCount: inst.chaseCount + 1,
        }).catch((error) => console.error(`Call notice failed for ${inst.id}:`, error));
        result.callsFlagged++;
      }
    }
  } catch (error) {
    console.error('Payment chase failed:', error);
  }

  return NextResponse.json({ success: true, ...result }, { status: 200 });
}
