import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { recurringCatalogue, sendOfferInvitation, serializeOffer } from '@/lib/care-offers';
import {
  DISCOUNT_MONTHS,
  MAX_RECURRING_DISCOUNT_PERCENT,
  buildSchedule,
  defaultFreeMonths,
  isDiscountType,
  isRecurringAddOn,
  monthlyRateCents,
  parseRecurringAddOns,
  planLabel,
  validateDiscount,
  RECURRING_ADD_ON_KEYS,
} from '@/lib/recurring';
import type { AddOnKey } from '@/lib/pricing';

/**
 * The care-plan upsell, run from a project rather than from a lead: by the
 * time it's worth having, the deal is long since won and the client is a
 * project in flight.
 *
 * Open to all staff, like every other endpoint on this page now — the second
 * role tier that used to withhold project money from a sales account came
 * down at the owner's request. See lib/authz.ts for what that traded away and
 * what is still enforced by role.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { id: true, email: true, company: true, contactName: true } },
        recurringOffers: {
          orderBy: { createdAt: 'desc' },
          include: { payments: { orderBy: { createdAt: 'desc' } } },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const inScope = parseRecurringAddOns(project.addOns);

    return NextResponse.json(
      {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
          company: project.client.company,
          contactName: project.client.contactName,
          email: project.client.email,
        },
        // What they already bought — the difference between "your included
        // months are running out" and a cold upsell, and the reason the free
        // months default the way they do.
        alreadyInScope: inScope,
        catalogue: recurringCatalogue(RECURRING_ADD_ON_KEYS),
        defaults: {
          addOns: inScope,
          discountMonths: DISCOUNT_MONTHS,
          freeMonths: defaultFreeMonths(inScope, inScope),
          maxPercent: MAX_RECURRING_DISCOUNT_PERCENT,
        },
        offers: project.recurringOffers.map(serializeOffer),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Recurring offers load error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { projectId } = await params;
    const body = await request.json();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: { select: { email: true, company: true, contactName: true } } },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const addOns: AddOnKey[] = Array.isArray(body.addOns)
      ? Array.from(
          new Set(
            (body.addOns as unknown[]).filter(
              (key): key is AddOnKey => typeof key === 'string' && isRecurringAddOn(key)
            )
          )
        )
      : [];

    if (addOns.length === 0) {
      return NextResponse.json(
        { error: 'Pick at least one monthly service to offer.' },
        { status: 400 }
      );
    }

    const discountType = isDiscountType(body.discountType) ? body.discountType : 'percent';
    const discountValue = Math.round(Number(body.discountValue) || 0);
    const monthlyCents = monthlyRateCents(addOns);

    const check = validateDiscount(monthlyCents, discountType, discountValue);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    // Bounded rather than free: the two covered months are a specific promise
    // ("first month included, second covered"), not a dial. Three is the slack
    // for a plan that starts late; anything beyond that is a different deal
    // and should be a different conversation.
    const requestedFreeMonths = Number(body.freeMonths);
    const freeMonths = Number.isFinite(requestedFreeMonths)
      ? Math.min(3, Math.max(0, Math.round(requestedFreeMonths)))
      : defaultFreeMonths(addOns, parseRecurringAddOns(project.addOns));

    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 600) : '';

    // One open offer at a time. Two live links for the same project is two
    // subscriptions waiting to happen, and the client would be billed twice
    // for the same hosting.
    const openOffer = await prisma.recurringOffer.findFirst({
      where: { projectId, status: { in: ['sent', 'active'] } },
    });
    if (openOffer) {
      return NextResponse.json(
        {
          error:
            openOffer.status === 'active'
              ? 'This project already has a care plan running. Cancel it before offering another.'
              : 'There is already an offer out for this project. Withdraw it before sending another.',
        },
        { status: 409 }
      );
    }

    const offer = await prisma.recurringOffer.create({
      data: {
        projectId,
        addOns: addOns.join(','),
        monthlyCents,
        discountType,
        discountValue,
        freeMonths,
        discountMonths: DISCOUNT_MONTHS,
        note: note || null,
        createdById: session.userId,
      },
    });

    const sent = await sendOfferInvitation({
      offer,
      clientEmail: project.client.email,
      contactName: project.client.contactName,
      company: project.client.company,
      projectAddOns: project.addOns,
    });

    const schedule = buildSchedule({
      addOns,
      monthlyCents,
      discountType,
      discountValue,
      freeMonths,
      discountMonths: DISCOUNT_MONTHS,
    });

    return NextResponse.json(
      {
        success: true,
        offer: serializeOffer({ ...offer, payments: [] }),
        planLabel: planLabel(addOns),
        schedule,
        emailed: sent.sent,
        // The offer exists either way — a mail failure must not lose the link,
        // because the link is the thing that still works when copied by hand.
        emailError: sent.sent ? null : sent.reason,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Recurring offer create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
