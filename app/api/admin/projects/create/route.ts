import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession, generateRandomPassword, hashPassword } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { sendWelcomeEmail } from '@/lib/email';
import {
  BASE_SERVICES,
  TIMELINES,
  calculatePrice,
  isAddOnKey,
  isBaseService,
  isClientType,
  isTimelineKey,
  minAllowedPrice,
  formatCents,
  type AddOnKey,
} from '@/lib/pricing';

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') {
      return unauthorizedResponse();
    }

    const {
      clientEmail,
      company,
      contactName,
      phone,
      baseService,
      addOns = [],
      clientType,
      timeline,
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

    const breakdown = calculatePrice({ baseService, addOns: addOnKeys, clientType, timeline });

    // Sales can discount within the approved band without asking; anything
    // deeper needs an owner logged in to actually set that price.
    if (
      typeof totalPriceOverride === 'number' &&
      totalPriceOverride > 0 &&
      session.role === 'sales' &&
      Math.round(totalPriceOverride) < minAllowedPrice(breakdown.totalPrice)
    ) {
      return NextResponse.json(
        {
          error: `That's below what you're authorized to quote for this scope. Minimum is ${formatCents(
            minAllowedPrice(breakdown.totalPrice)
          )} (calculated: ${formatCents(breakdown.totalPrice)}). Ask Kiana if this deal needs a deeper discount.`,
        },
        { status: 403 }
      );
    }

    const totalPrice =
      typeof totalPriceOverride === 'number' && totalPriceOverride > 0
        ? Math.round(totalPriceOverride)
        : breakdown.totalPrice;

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
      await prisma.lead.update({
        where: { id: convertedFromLeadId },
        data: { status: 'won' },
      }).catch(() => {}); // lead may already be deleted/invalid — non-fatal
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
