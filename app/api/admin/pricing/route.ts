import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/middleware';
import {
  ADD_ONS,
  ADD_ON_CATEGORIES,
  BASE_SERVICES,
  CLIENT_TYPES,
  TIMELINES,
} from '@/lib/pricing';
import {
  MULTIPLIER_SCALE,
  catalogueDefaults,
  isValidPricingKey,
  resolvedPricing,
  validateOverride,
} from '@/lib/pricing-overrides';

/**
 * The pricing catalogue, and the prices the team has changed.
 *
 * Read by the settings UI so prices can be adjusted without a deploy. Every
 * row reports both the current price and the shipped one, so it is always
 * obvious what has been changed and what "revert" would do.
 */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const [current, overrides] = await Promise.all([
      resolvedPricing(),
      prisma.pricingOverride.findMany({
        include: { updatedBy: { select: { name: true, email: true } } },
      }),
    ]);
    const defaults = catalogueDefaults();
    const overrideByKey = new Map(overrides.map((o) => [o.key, o]));

    const decorate = (key: string, currentValue: number, defaultValue: number) => {
      const override = overrideByKey.get(key);
      return {
        key,
        value: currentValue,
        defaultValue,
        overridden: Boolean(override),
        updatedBy: override?.updatedBy?.name || override?.updatedBy?.email || null,
        updatedAt: override?.updatedAt ?? null,
      };
    };

    return NextResponse.json(
      {
        success: true,
        multiplierScale: MULTIPLIER_SCALE,
        baseServices: Object.entries(BASE_SERVICES).map(([key, svc]) => ({
          ...decorate(`base:${key}`, current.baseServices[key], defaults.baseServices[key]),
          label: svc.label,
          description: svc.description,
        })),
        addOns: Object.entries(ADD_ONS).map(([key, addOn]) => ({
          ...decorate(`addon:${key}`, current.addOns[key], defaults.addOns[key]),
          label: addOn.label,
          category: ADD_ON_CATEGORIES[addOn.category].label,
        })),
        clientTypes: Object.entries(CLIENT_TYPES).map(([key, type]) => ({
          ...decorate(
            `clientType:${key}`,
            Math.round(current.clientTypeMultipliers[key] * MULTIPLIER_SCALE),
            Math.round(defaults.clientTypeMultipliers[key] * MULTIPLIER_SCALE)
          ),
          label: type.label,
        })),
        timelines: Object.entries(TIMELINES).map(([key, tl]) => ({
          ...decorate(
            `timeline:${key}`,
            Math.round(current.timelineMultipliers[key] * MULTIPLIER_SCALE),
            Math.round(defaults.timelineMultipliers[key] * MULTIPLIER_SCALE)
          ),
          label: tl.label,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get pricing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Set or clear one price.
 *
 * Owner-only. A rep's discount authority is already bounded by
 * minAllowedPrice on individual proposals; changing the catalogue price
 * changes what everyone quotes from then on, which is a different
 * decision with a different blast radius.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();
    if (session.role !== 'owner' && session.role !== 'admin') {
      return forbiddenResponse();
    }

    const { key, value } = await request.json();

    if (typeof key !== 'string' || !isValidPricingKey(key)) {
      return NextResponse.json({ error: 'Unknown pricing item' }, { status: 400 });
    }

    // null clears the override and reverts to the shipped price.
    if (value === null) {
      await prisma.pricingOverride.deleteMany({ where: { key } });
      return NextResponse.json({ success: true, reverted: true }, { status: 200 });
    }

    const numeric = Math.round(Number(value));
    const check = validateOverride(key, numeric);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    await prisma.pricingOverride.upsert({
      where: { key },
      update: { value: numeric, updatedById: session.userId },
      create: { key, value: numeric, updatedById: session.userId },
    });

    // Changing what everything costs is worth a line in team chat — silent
    // price changes are how two people quote two different numbers in the
    // same week.
    await prisma.teamMessage
      .create({
        data: {
          content: `💷 Pricing updated: ${key} is now ${numeric}${
            key.startsWith('clientType') || key.startsWith('timeline')
              ? ` (×${(numeric / MULTIPLIER_SCALE).toFixed(2)})`
              : ' cents'
          }`,
          fromUserId: session.userId,
          kind: 'pricing_change',
        },
      })
      .catch((error) => console.error('Failed to announce pricing change:', error));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Update pricing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
