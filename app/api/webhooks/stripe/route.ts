import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { constructWebhookEvent } from '@/lib/stripe';
import {
  generateRandomPassword,
  hashPassword,
} from '@/lib/auth';
import { sendWelcomeEmail } from '@/lib/email';
import {
  ADD_ONS,
  BASE_SERVICES,
  TIMELINES,
  isAddOnKey,
  isBaseService,
  isTimelineKey,
  type AddOnKey,
  type BaseService,
  type TimelineKey,
} from '@/lib/pricing';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature') || '';

  const event = constructWebhookEvent(body, signature);

  if (!event) {
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  const metadata = session.metadata as Record<string, string> | null;

  if (!metadata || !metadata.clientEmail || !metadata.company) {
    throw new Error('Missing metadata in checkout session');
  }

  const {
    clientEmail: email,
    company,
    contactName,
    phone,
    baseService: rawBaseService,
    addOns: rawAddOns,
    timeline: rawTimeline,
    basePrice: rawBasePrice,
    totalPrice: rawTotalPrice,
  } = metadata;

  const baseService: BaseService =
    rawBaseService && isBaseService(rawBaseService) ? rawBaseService : 'website';
  const addOnKeys: AddOnKey[] = (rawAddOns || '')
    .split(',')
    .map((a) => a.trim())
    .filter((a): a is AddOnKey => isAddOnKey(a));
  const timeline: TimelineKey =
    rawTimeline && isTimelineKey(rawTimeline) ? rawTimeline : 'standard';
  const basePrice = Number(rawBasePrice) || BASE_SERVICES[baseService].price;
  const totalPrice = Number(rawTotalPrice) || basePrice;

  // Idempotency: Stripe may redeliver the same event
  const existingProjectForSession = await prisma.project.findFirst({
    where: { stripeSessionId: session.id },
  });
  if (existingProjectForSession) {
    return;
  }

  let client = await prisma.client.findUnique({ where: { email } });
  let generatedPassword: string | null = null;

  if (!client) {
    generatedPassword = generateRandomPassword();
    const hashedPassword = await hashPassword(generatedPassword);

    client = await prisma.client.create({
      data: {
        email,
        password: hashedPassword,
        company,
        contactName: contactName || null,
        phone: phone || null,
        stripeCustomerId: (session.customer as string) || null,
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
  const addOnsCsv = addOnKeys.join(',');
  const projectName = `${company} — ${BASE_SERVICES[baseService].label}`;

  const project = await prisma.project.create({
    data: {
      clientId: client.id,
      name: projectName,
      baseService,
      addOns: addOnsCsv,
      status: 'discovery',
      statusStage: 0,
      timeline: timelineLabel,
      basePrice,
      totalPrice,
      stripeSessionId: session.id,
    },
  });

  await prisma.projectUpdate.create({
    data: {
      projectId: project.id,
      title: 'Project Created',
      description: 'Your project has been created and is awaiting onboarding. We will be in touch shortly to kick off the discovery phase.',
      statusStage: 'discovery',
      userId: null,
    },
  });

  await sendWelcomeEmail(
    email,
    contactName || company,
    generatedPassword || '(existing account — use your current password)',
    projectName,
    BASE_SERVICES[baseService].label,
    timelineLabel
  );

  console.log(`Checkout completed: client=${client.id} project=${project.id}`);
}
