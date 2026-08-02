import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { constructWebhookEvent } from '@/lib/stripe';
import {
  generateRandomPassword,
  hashPassword,
} from '@/lib/auth';
import { sendWelcomeEmail } from '@/lib/email';
import { alertEmailDeliveryFailure, notifyAdminsPaymentReceived } from '@/lib/notify';
import { formatCents } from '@/lib/pricing';
import {
  ADD_ONS,
  BASE_SERVICES,
  TIMELINES,
  isAddOnKey,
  isBaseService,
  isTimelineKey,
  sanitizeCustomItems,
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

  if (!metadata) {
    throw new Error('Missing metadata in checkout session');
  }

  // A payment against a project that already exists (a deposit's balance,
  // or a top-up) — no new client/project to create, just record the payment.
  if (metadata.existingProjectId) {
    await handleExistingProjectPayment(session, metadata);
    return;
  }

  if (!metadata.clientEmail || !metadata.company) {
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
    customItems: rawCustomItems,
    leadId,
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
  const customItems = sanitizeCustomItems(
    (() => {
      try {
        return rawCustomItems ? JSON.parse(rawCustomItems) : [];
      } catch {
        return [];
      }
    })()
  );

  // Idempotency: Stripe may redeliver the same event
  const existingProjectForSession = await prisma.project.findFirst({
    where: { stripeSessionId: session.id },
  });
  if (existingProjectForSession) {
    return;
  }

  const existingClient = await prisma.client.findUnique({ where: { email } });
  const generatedPassword = existingClient ? null : generateRandomPassword();
  const hashedPassword = generatedPassword ? await hashPassword(generatedPassword) : null;

  const timelineLabel = TIMELINES[timeline].weeks;
  const addOnsCsv = addOnKeys.join(',');
  const projectName = `${company} — ${BASE_SERVICES[baseService].label}`;
  const amountPaid = session.amount_total ?? totalPrice;

  // One transaction for the whole provisioning step.
  //
  // These five writes used to run as five independent statements. Any
  // failure part-way through — a dropped connection, a constraint, a cold
  // Lambda dying — left a client with a project and no Payment row, which
  // then showed up on the ops dashboard as a fully unpaid, overdue balance
  // for money that was already in the bank. There is no partial state worth
  // keeping here: either the customer exists with a project and a receipt,
  // or Stripe retries the webhook and we try again from nothing.
  const { client, project } = await prisma.$transaction(async (tx) => {
    const client =
      existingClient ??
      (await tx.client.create({
        data: {
          email,
          password: hashedPassword!,
          company,
          contactName: contactName || null,
          phone: phone || null,
          stripeCustomerId: (session.customer as string) || null,
        },
      }));

    if (!existingClient) {
      await tx.emailPreferences.create({
        data: {
          clientId: client.id,
          notificationsEnabled: true,
          digestFrequency: 'daily',
          statusUpdates: true,
          messages: true,
        },
      });
    }

    const project = await tx.project.create({
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
        customItems: customItems as unknown as Prisma.InputJsonValue,
        stripeSessionId: session.id,
        convertedFromLeadId: leadId || null,
      },
    });

    await tx.projectUpdate.create({
      data: {
        projectId: project.id,
        title: 'Project Created',
        description:
          'Your project has been created and is awaiting onboarding. We will be in touch shortly to kick off the discovery phase.',
        statusStage: 'discovery',
        userId: null,
      },
    });

    await tx.payment.create({
      data: {
        projectId: project.id,
        amount: amountPaid,
        type: metadata.paymentType === 'deposit' ? 'deposit' : 'full',
        stripeSessionId: session.id,
      },
    });

    return { client, project };
  });

  // Everything past this point is notification, not provisioning. It stays
  // outside the transaction: a slow SMTP call must not hold a database
  // transaction open, and an email that fails is worth an alert, not a
  // rollback of a payment that already cleared.

  // This checkout was closed from a lead's payment link (rather than the
  // public /start form) — this is the moment the deal is actually won, so
  // mark it in the CRM automatically instead of leaving it stuck until
  // someone remembers to update it by hand.
  if (leadId) {
    const lead = await prisma.lead.update({ where: { id: leadId }, data: { status: 'won' } }).catch(() => null);
    if (lead?.signedContractUrl) {
      // Carry the signed copy over so the client can find it on their own
      // project — leads aren't visible to clients, but projects are.
      await prisma.project.update({ where: { id: project.id }, data: { contractUrl: lead.signedContractUrl } });
    }
    const notifier = lead?.assignedToId || (await prisma.user.findFirst({ select: { id: true } }))?.id;
    if (lead && notifier) {
      await prisma.teamMessage.create({
        data: {
          content: `🎉 ${company} paid and their project is live — deposit/payment cleared via payment link.`,
          fromUserId: notifier,
          relatedLeadId: leadId,
          relatedProjectId: project.id,
        },
      });
    }
  }

  await notifyAdminsPaymentReceived({
    projectId: project.id,
    projectName,
    clientCompany: company,
    amountLabel: formatCents(amountPaid),
  });

  const welcomeSent = await sendWelcomeEmail(
    email,
    contactName || company,
    generatedPassword,
    projectName,
    BASE_SERVICES[baseService].label,
    timelineLabel
  );

  // For a brand-new client this email carries the only copy of their
  // temporary password. Swallowing the failure meant they simply never got
  // into their dashboard, and we found out when they asked.
  if (!welcomeSent) {
    await alertEmailDeliveryFailure({
      kind: 'client welcome email',
      recipient: email,
      context: {
        company,
        project: projectName,
        projectId: project.id,
        amountPaid: formatCents(amountPaid),
        temporaryPassword: generatedPassword ?? '(existing account — no new password issued)',
      },
    });
  }

  console.log(`Checkout completed: client=${client.id} project=${project.id}`);
}

async function handleExistingProjectPayment(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
) {
  const projectId = metadata.existingProjectId;

  // Idempotency: Stripe may redeliver the same event
  const existing = await prisma.payment.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) {
    throw new Error(`Payment webhook: project ${projectId} not found`);
  }

  const amountPaid = session.amount_total ?? 0;
  const type = metadata.paymentType === 'deposit' ? 'deposit' : 'balance';

  await prisma.payment.create({
    data: {
      projectId,
      amount: amountPaid,
      type,
      stripeSessionId: session.id,
    },
  });

  await prisma.projectUpdate.create({
    data: {
      projectId,
      title: type === 'deposit' ? 'Deposit received' : 'Payment received',
      description: `We've received your payment of ${formatCents(amountPaid)}. Thank you!`,
      statusStage: project.status,
      userId: null,
    },
  });

  await notifyAdminsPaymentReceived({
    projectId,
    projectName: project.name,
    clientCompany: project.client.company,
    amountLabel: formatCents(amountPaid),
  });

  console.log(`Existing-project payment: project=${projectId} amount=${amountPaid}`);
}
