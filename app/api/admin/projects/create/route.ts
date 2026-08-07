import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateRandomPassword, hashPassword } from '@/lib/auth';
import { canOverridePricing, requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { ANY_STAFF, requireRole } from '@/lib/authz';
import { sendWelcomeEmail } from '@/lib/email';
import {
  BASE_SERVICES,
  TIMELINES,
  calculatePrice,
  customItemsTotal,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  minAllowedPrice,
  formatCents,
  sanitizeCustomItems,
  type AddOnKey,
} from '@/lib/pricing';

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }
    // Client records and project money are ops, not sales — the admin
    // nav already withholds these pages from a sales account.
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;


    const {
      clientEmail,
      company,
      contactName,
      phone,
      baseService,
      addOns = [],
      clientType,
      timeline,
      customItems: rawCustomItems = [],
      totalPriceOverride,
      convertedFromLeadId,
    } = await request.json();

    if (!clientEmail || !company) {
      return NextResponse.json(
        { error: 'Client email and company are required' },
        { status: 400 }
      );
    }
    if (!isBaseService(baseService)) {
      return NextResponse.json({ error: 'Invalid base service' }, { status: 400 });
    }
    if (!isClientType(clientType)) {
      return NextResponse.json({ error: 'Invalid client type' }, { status: 400 });
    }
    if (!isTimelineKey(timeline)) {
      return NextResponse.json({ error: 'Invalid timeline' }, { status: 400 });
    }
    const addOnKeys: AddOnKey[] = Array.isArray(addOns)
      ? addOns.filter((a: string) => isAddOnKey(a))
      : [];
    const customItems = sanitizeCustomItems(rawCustomItems);

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });
    const calculatedTotal = breakdown.totalPrice + customItemsTotal(customItems);

    // Sales can discount within the approved band without asking; anything
    // deeper needs an owner logged in to actually set that price.
    if (
      typeof totalPriceOverride === 'number' &&
      totalPriceOverride > 0 &&
      !canOverridePricing(session) &&
      Math.round(totalPriceOverride) < minAllowedPrice(calculatedTotal)
    ) {
      return NextResponse.json(
        {
          error: `That's below what you're authorized to quote for this scope. Minimum is ${formatCents(
            minAllowedPrice(calculatedTotal)
          )} (calculated: ${formatCents(calculatedTotal)}). Ask Kiana if this deal needs a deeper discount.`,
        },
        { status: 403 }
      );
    }

    const totalPrice =
      typeof totalPriceOverride === 'number' && totalPriceOverride > 0
        ? Math.round(totalPriceOverride)
        : calculatedTotal;

    let client = await prisma.client.findUnique({ where: { email: clientEmail } });
    let generatedPassword: string | null = null;

    if (!client) {
      generatedPassword = generateRandomPassword();
      const hashedPassword = await hashPassword(generatedPassword);

      client = await prisma.client.create({
        data: {
          email: clientEmail,
          password: hashedPassword,
          company,
          contactName: contactName || null,
          phone: phone || null,
        },
      });

      await prisma.emailPreferences.create({
        data: {
          clientId: client.id,
          notificationsEnabled: true,
          digestFrequency: 'daily',
          statusUpdates: true,
          messages: true,
        },
      });
    }

    const timelineLabel = TIMELINES[timeline].weeks;
    const projectName = `${company} — ${BASE_SERVICES[baseService].label}`;

    const project = await prisma.project.create({
      data: {
        clientId: client.id,
        name: projectName,
        baseService,
        addOns: addOnKeys.join(','),
        status: 'discovery',
        statusStage: 0,
        timeline: timelineLabel,
        basePrice: breakdown.basePrice,
        totalPrice,
        customItems: customItems as unknown as Prisma.InputJsonValue,
        convertedFromLeadId: convertedFromLeadId || null,
      },
    });

    await prisma.projectUpdate.create({
      data: {
        projectId: project.id,
        title: 'Project Created',
        description:
          'Your project has been created and is awaiting onboarding. We will be in touch shortly to kick off the discovery phase.',
        statusStage: 'discovery',
        userId: session.userId,
      },
    });

    if (convertedFromLeadId) {
      // Converting a lead into a paying project is the deal closing — reflect
      // that in the CRM so it shows up correctly in the sales dashboard.
      //
      // The close date is stamped through `updateMany` guarded on `wonAt:
      // null` rather than read-then-write: it means a lead that somehow
      // arrives here twice keeps its first close date instead of being
      // re-dated to the second attempt.
      await prisma.lead
        .updateMany({ where: { id: convertedFromLeadId, wonAt: null }, data: { wonAt: new Date() } })
        .catch(() => null);
      const updatedLead = await prisma.lead
        .update({ where: { id: convertedFromLeadId }, data: { status: 'won' } })
        .catch(() => null); // lead may already be deleted/invalid — non-fatal

      if (updatedLead?.signedContractUrl) {
        await prisma.project.update({
          where: { id: project.id },
          data: { contractUrl: updatedLead.signedContractUrl },
        });
      }
    }

    if (generatedPassword) {
      await sendWelcomeEmail(
        clientEmail,
        contactName || company,
        generatedPassword,
        projectName,
        BASE_SERVICES[baseService].label,
        timelineLabel
      );
    }

    return NextResponse.json(
      { success: true, project, clientCreated: !!generatedPassword },
      { status: 201 }
    );
  } catch (error) {
    console.error('Manual project creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
