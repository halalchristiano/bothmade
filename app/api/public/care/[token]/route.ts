import { NextRequest, NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site-url';
import { requireStaff } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';
import { RATE_LIMITS, checkRateLimit, enforceRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createRecurringCheckoutSession } from '@/lib/stripe';
import { buildCareOfferUrl } from '@/lib/share-links';
import { scheduleForOffer } from '@/lib/care-offers';
import { ADD_ONS, formatCents } from '@/lib/pricing';
import { monthsAsDays, parseRecurringAddOns, planLabel, scheduleLines, type DiscountType } from '@/lib/recurring';

/**
 * The no-login care-plan offer page's data, and the click that starts the
 * subscription.
 *
 * The token in the path is the whole capability — it is what says this person
 * was sent this offer — so both handlers are rate limited the way the other
 * public share links are. The POST especially: it opens a Stripe session and
 * mints a coupon per call.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const limited = await enforceRateLimit(
    request,
    'care-offer-read',
    RATE_LIMITS.publicRead,
    'Too many requests. Please wait a moment and try again.'
  );
  if (limited) return limited;

  try {
    const { token } = await params;

    // Looked up by the token itself rather than compared afterwards: this
    // column is unique and indexed, so there is no separate ID to leak by
    // knowing. A miss and a wrong token are the same 404.
    const offer = await prisma.recurringOffer.findUnique({
      where: { token },
      include: {
        project: {
          select: {
            name: true,
            addOns: true,
            client: { select: { company: true, contactName: true } },
          },
        },
      },
    });

    if (!offer) {
      return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    }

    const schedule = scheduleForOffer(offer);
    const inScope = new Set(parseRecurringAddOns(offer.project.addOns));

    return NextResponse.json(
      {
        success: true,
        offer: {
          status: offer.status,
          company: offer.project.client.company,
          contactName: offer.project.client.contactName,
          projectName: offer.project.name,
          planLabel: planLabel(schedule.addOns),
          services: schedule.addOns.map((key) => ({
            label: ADD_ONS[key].label,
            description: ADD_ONS[key].description,
            benefit: ADD_ONS[key].benefit,
            price: ADD_ONS[key].price,
            alreadyInScope: inScope.has(key),
          })),
          note: offer.note,
          monthlyCents: schedule.monthlyCents,
          discountedCents: schedule.discountedCents,
          savingsPerMonth: schedule.savingsPerMonth,
          firstYearSavings: schedule.firstYearSavings,
          freeMonths: schedule.freeMonths,
          discountMonths: schedule.discountMonths,
          standardRateFromMonth: schedule.standardRateFromMonth,
          scheduleLines: scheduleLines(schedule),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Care offer read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const message = 'Too many attempts. Please wait a moment and try again.';
    const limited = await enforceRateLimit(request, 'care-offer-accept', RATE_LIMITS.publicWrite, message);
    if (limited) return limited;

    // Per offer as well as per address, so one link being hammered doesn't
    // depend on the caller keeping the same IP.
    const perOffer = await checkRateLimit(`care-offer-accept:${token}`, RATE_LIMITS.publicWrite);
    if (!perOffer.allowed) return rateLimitResponse(perOffer, message);

    const offer = await prisma.recurringOffer.findUnique({
      where: { token },
      include: {
        project: {
          select: {
            id: true,
            client: { select: { email: true, company: true, stripeCustomerId: true } },
          },
        },
      },
    });

    if (!offer) {
      return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
    }

    // An accepted, withdrawn or canceled offer must not open a second
    // subscription — that is the same client billed twice for one plan.
    if (offer.status !== 'sent') {
      return NextResponse.json(
        {
          error:
            offer.status === 'active'
              ? 'This plan is already running — nothing more to do.'
              : 'This offer is no longer available. Get in touch and we\'ll send a fresh one.',
          closed: true,
        },
        { status: 410 }
      );
    }

    const schedule = scheduleForOffer(offer);
    const label = planLabel(schedule.addOns);
    const siteUrl = resolveSiteUrl();

    const checkout = await createRecurringCheckoutSession(
      {
        offerId: offer.id,
        projectId: offer.project.id,
        clientEmail: offer.project.client.email,
        stripeCustomerId: offer.project.client.stripeCustomerId,
        productName: `${offer.project.client.company} — ${label}`,
        productDescription:
          schedule.savingsPerMonth > 0
            ? `${formatCents(schedule.discountedCents)}/month for the first ${schedule.discountMonths} billed months, then ${formatCents(schedule.monthlyCents)}/month.`
            : `${formatCents(schedule.monthlyCents)}/month.`,
        monthlyCents: schedule.monthlyCents,
        discountType: schedule.discountType as DiscountType,
        discountValue: schedule.discountValue,
        couponDurationMonths: schedule.couponDurationMonths,
        // Converted from calendar months at the moment of signing rather than
        // stored, because "two months free" is only a number of days once you
        // know which two months.
        trialDays: monthsAsDays(new Date(), schedule.freeMonths),
      },
      `${siteUrl}/checkout/success?type=care`,
      buildCareOfferUrl(offer.token, siteUrl)
    );

    if (!checkout.ok) {
      /**
       * The client gets a polite sentence; whoever is testing the link gets
       * the actual reason.
       *
       * These failures are not transient — a key in the wrong mode or a
       * misconfigured plan fails identically every time — so "try again in a
       * moment" was advice that could never work, and the real message lived
       * only in a server log. Anyone signed into the admin is by definition
       * staff checking their own link, so they see what Stripe said.
       */
      const staff = await requireStaff().catch(() => null);
      return NextResponse.json(
        {
          error: staff
            ? `Stripe refused to open checkout — ${checkout.reason}`
            : "We couldn't open checkout just now. Please try again in a moment.",
          ...(staff ? { staffOnly: true } : {}),
        },
        { status: 502 }
      );
    }

    // Recorded before the redirect so the webhook can be matched back to this
    // offer even if the client closes the tab mid-payment.
    await prisma.recurringOffer.update({
      where: { id: offer.id },
      data: {
        stripeCheckoutSessionId: checkout.sessionId,
        stripeCouponId: checkout.couponId,
      },
    });

    return NextResponse.json({ success: true, url: checkout.url }, { status: 200 });
  } catch (error) {
    console.error('Care offer accept error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
