import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { sendOfferInvitation, serializeOffer } from '@/lib/care-offers';
import { cancelSubscriptionAtPeriodEnd } from '@/lib/stripe';

/**
 * What happens to an offer after it goes out: send it again, withdraw it, or
 * stop a plan that's already billing.
 *
 * The role split is the one the rest of the app draws. Chasing an offer is
 * sales, so any staff account can resend or withdraw. Stopping money already
 * coming in is ops, same as collecting a balance — a sales session that's been
 * borrowed or phished should not be able to switch off a client's billing.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { offerId } = await params;
    const body = await request.json();
    const action = String(body.action || '');

    const offer = await prisma.recurringOffer.findUnique({
      where: { id: offerId },
      include: {
        project: {
          include: { client: { select: { email: true, company: true, contactName: true } } },
        },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    if (action === 'resend') {
      const denied = requireRole(session, ANY_STAFF);
      if (denied) return denied;

      if (offer.status !== 'sent') {
        return NextResponse.json(
          { error: 'Only an offer that is still open can be sent again.' },
          { status: 409 }
        );
      }

      const sent = await sendOfferInvitation({
        offer,
        clientEmail: offer.project.client.email,
        contactName: offer.project.client.contactName,
        company: offer.project.client.company,
        projectAddOns: offer.project.addOns,
      });

      const updated = await prisma.recurringOffer.update({
        where: { id: offerId },
        data: { sentAt: new Date() },
      });

      return NextResponse.json(
        {
          success: true,
          offer: serializeOffer({ ...updated, payments: offer.payments }),
          emailed: sent.sent,
          emailError: sent.sent ? null : sent.reason,
        },
        { status: 200 }
      );
    }

    if (action === 'withdraw') {
      const denied = requireRole(session, ANY_STAFF);
      if (denied) return denied;

      if (offer.status !== 'sent') {
        return NextResponse.json(
          { error: 'This offer is no longer open.' },
          { status: 409 }
        );
      }

      const updated = await prisma.recurringOffer.update({
        where: { id: offerId },
        data: { status: 'declined', declinedAt: new Date() },
      });

      return NextResponse.json(
        { success: true, offer: serializeOffer({ ...updated, payments: offer.payments }) },
        { status: 200 }
      );
    }

    if (action === 'cancel') {
      const denied = requireRole(session, ANY_STAFF);
      if (denied) return denied;

      if (offer.status !== 'active' || !offer.stripeSubscriptionId) {
        return NextResponse.json({ error: 'This plan is not billing.' }, { status: 409 });
      }

      // Stripe first. Marking it canceled here while the subscription keeps
      // running is the failure mode that bills a client we told we'd stopped.
      const stopped = await cancelSubscriptionAtPeriodEnd(offer.stripeSubscriptionId);
      if (!stopped) {
        return NextResponse.json(
          { error: "Stripe wouldn't cancel the subscription. Nothing was changed — try again." },
          { status: 502 }
        );
      }

      const updated = await prisma.recurringOffer.update({
        where: { id: offerId },
        data: { status: 'canceled', canceledAt: new Date() },
      });

      await prisma.projectUpdate.create({
        data: {
          projectId: offer.projectId,
          title: 'Care plan ending',
          description:
            "Your monthly care plan has been canceled. It stays active until the end of the month you've already paid for, and you won't be charged again after that.",
          statusStage: offer.project.status,
          userId: session.userId,
        },
      });

      return NextResponse.json(
        { success: true, offer: serializeOffer({ ...updated, payments: offer.payments }) },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Recurring offer update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
