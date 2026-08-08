import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { constructWebhookEvent } from '@/lib/stripe';
import {
  generateRandomPassword,
  hashPassword,
} from '@/lib/auth';
import {
  sendCarePlanEndedEmail,
  sendCarePlanInvoiceEmail,
  sendCarePlanPaymentFailedEmail,
  sendCarePlanStartedEmail,
  sendPaymentReceiptEmail,
  sendWelcomeEmail,
} from '@/lib/email';
import { resolveSiteUrl } from '@/lib/site-url';
import { addMonthsClamped, billingPeriod, invoiceDate } from '@/lib/money-dates';
import {
  notifyAdminsCarePlanEnded,
  notifyAdminsCarePlanPaymentFailed,
  notifyAdminsCarePlanStarted,
  notifyAdminsPaymentReceived,
} from '@/lib/notify';
import { buildCarePlanInvoicePdf } from '@/lib/invoice-pdf';
import { restoreInvoicePdfAsPaid } from '@/lib/invoice-dispatch';
import { projectStanding } from '@/lib/project-standing';
import { OWED_INSTALMENT_STATUSES, seedInstalments } from '@/lib/instalments';
import { createInvoiceRow } from '@/lib/billing';
import { discountLabel, scheduleForOffer } from '@/lib/care-offers';
import { planLabel, scheduleLines } from '@/lib/recurring';
import { formatCents, formatCentsExact } from '@/lib/pricing';
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

/**
 * The date on a receipt. Spelled out rather than numeric, because this is
 * read by clients on both sides of the Atlantic and 04/08/2026 is two
 * different days depending on who is holding it.
 */
function receiptDate(): string {
  return invoiceDate(new Date());
}

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
      // Care plans bill monthly forever, and nobody watches a Stripe
      // dashboard. These three are what turn a subscription into something
      // the client and the studio both hear about every month.
      case 'invoice.payment_succeeded': {
        await handleCarePlanInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      }
      case 'invoice.payment_failed': {
        await handleCarePlanInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionEnded(event.data.object as Stripe.Subscription);
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

  // A monthly care plan someone accepted. Nothing to create — the project and
  // the client already exist; this switches the offer on.
  if (metadata.recurringOfferId) {
    await handleCarePlanStarted(session, metadata);
    return;
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

  // Idempotency: Stripe may redeliver the same event. A redelivery can also
  // be the retry that RESCUES a half-created project — if the first delivery
  // died after creating the project but before (or during) seeding its
  // instalment schedule, this is the moment to finish the job rather than
  // silently leave a project whose schedule under-reports what is owed.
  const existingProjectForSession = await prisma.project.findFirst({
    where: { stripeSessionId: session.id },
    include: { instalments: { select: { id: true } } },
  });
  if (existingProjectForSession) {
    if (existingProjectForSession.instalments.length === 0) {
      await prisma.$transaction((tx) =>
        seedInstalments(
          tx,
          { id: existingProjectForSession.id, totalPrice: existingProjectForSession.totalPrice },
          session.amount_total ??
            (metadata.paymentType === 'deposit'
              ? Number(metadata.depositAmount) || 0
              : existingProjectForSession.totalPrice),
          session.id
        )
      );
    }
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
      customItems: customItems as unknown as Prisma.InputJsonValue,
      stripeSessionId: session.id,
      convertedFromLeadId: leadId || null,
    },
  });

  // This checkout is tied to a CRM lead — either a payment link sent to an
  // existing one, or the row /api/checkout writes before redirecting to
  // Stripe. Either way this is the moment the deal is actually won, so mark
  // it automatically instead of leaving it stuck until someone remembers.
  if (leadId) {
    // Guarded on `wonAt: null` so a redelivered webhook — Stripe retries, and
    // this handler is meant to be idempotent — cannot re-date a deal that was
    // already closed.
    await prisma.lead
      .updateMany({ where: { id: leadId, wonAt: null }, data: { wonAt: new Date() } })
      .catch(() => null);
    const lead = await prisma.lead
      .update({ where: { id: leadId }, data: { status: 'won' } })
      .catch((error) => {
        // The project and payment exist — a lead stuck un-won is a pipeline
        // lie someone has to notice, so at least say it happened.
        console.error(`Webhook: paid lead ${leadId} could not be marked won:`, error);
        return null;
      });
    if (lead?.signedContractUrl) {
      // Carry the signed copy over so the client can find it on their own
      // project — leads aren't visible to clients, but projects are.
      await prisma.project.update({ where: { id: project.id }, data: { contractUrl: lead.signedContractUrl } });
    }
    const notifier = lead?.assignedToId || (await prisma.user.findFirst({ select: { id: true } }))?.id;
    if (lead && notifier) {
      await prisma.teamMessage.create({
        data: {
          content: `🎉 ${company} paid and their project is live — deposit/payment cleared.`,
          fromUserId: notifier,
          relatedLeadId: leadId,
          relatedProjectId: project.id,
          // The app narrating, not the assigned rep speaking — rendered as a
          // timeline row so nobody reads a celebration they never typed.
          kind: 'system',
        },
      });
    }
  }

  await prisma.projectUpdate.create({
    data: {
      projectId: project.id,
      title: 'Project Created',
      description: 'Your project has been created and is awaiting onboarding. We will be in touch shortly to kick off the discovery phase.',
      statusStage: 'discovery',
      userId: null,
    },
  });

  const amountPaid = session.amount_total ?? totalPrice;
  await prisma.payment.create({
    data: {
      projectId: project.id,
      amount: amountPaid,
      type: metadata.paymentType === 'deposit' ? 'deposit' : 'full',
      stripeSessionId: session.id,
    },
  });

  // Seed the three-instalment schedule the contract promised, marking as
  // paid whatever this checkout covered — the first instalment on a normal
  // signing, all three on pay-in-full. Atomic, so a mid-seed failure leaves
  // zero rows rather than a partial schedule that under-reports what is
  // owed; and thrown, so Stripe's redelivery (caught by the idempotency
  // branch above, which back-fills an empty schedule) gets to finish the
  // job. On a deposit sale where Stripe ever omitted amount_total, fall
  // back to the DEPOSIT, not the whole price — the old fallback would have
  // marked all three instalments paid on one deposit.
  const seedAmount =
    session.amount_total ??
    (metadata.paymentType === 'deposit' ? Number(metadata.depositAmount) || 0 : totalPrice);
  await prisma.$transaction((tx) => seedInstalments(tx, project, seedAmount, session.id));

  /**
   * Put the signing payment in the ledger.
   *
   * Payments 2 and 3 raise an Invoice row when they are sent, so they appear
   * under "Invoices raised" with a number. Payment 1 never did: the
   * sign-and-pay flow rendered its PDF onto the lead and took the money, and
   * the ledger simply had no record of it. That made the invoice list a lie
   * by omission — the one payment every client makes was the one missing
   * from the list of invoices, and the numbering skipped it too.
   *
   * Recorded as already paid, because it is. Best-effort: the money has
   * cleared and the project exists, so failing to number the paperwork must
   * not throw away the event.
   */
  // Kept so the receipt below can quote the number this payment was written
  // to the ledger under, rather than sending a receipt that references
  // nothing the client could look up.
  let signingInvoiceNumber: string | null = null;

  try {
    const paidRows = await prisma.instalment.findMany({
      where: { projectId: project.id, status: 'paid' },
      orderBy: { index: 'asc' },
    });
    for (const row of paidRows) {
      if (row.invoiceNumber) {
        signingInvoiceNumber ??= row.invoiceNumber;
        continue;
      }
      const invoice = await createInvoiceRow(prisma, {
        clientId: client.id,
        projectId: project.id,
        description: `${row.label} — ${projectName}`,
        lineItems: [{ label: `${row.label} (${row.percent}% of project total)`, priceCents: row.amountCents }],
        amountCents: row.amountCents,
        sentToEmail: email,
        status: 'paid',
        paidAt: new Date(),
      });
      if (invoice) {
        await prisma.instalment.update({
          where: { id: row.id },
          data: { invoiceNumber: invoice.number },
        });
        signingInvoiceNumber ??= invoice.number;
      }
    }
  } catch (ledgerError) {
    console.error(`Signing payment for project ${project.id} was not written to the ledger:`, ledgerError);
  }

  await notifyAdminsPaymentReceived({
    projectId: project.id,
    projectName,
    clientCompany: company,
    amountLabel: formatCents(amountPaid),
  });

  await sendWelcomeEmail(
    email,
    contactName || company,
    generatedPassword || '(existing account — use your current password)',
    projectName,
    BASE_SERVICES[baseService].label,
    timelineLabel
  );

  /*
   * A receipt for the signing payment, separately from the welcome.
   *
   * The welcome email confirms the project exists and hands over login
   * details; it has never mentioned money at all. So the single largest
   * payment most clients ever make here — the deposit or the full fee, taken
   * at signing — was the one payment with no acknowledgement of any kind,
   * even though the ledger had already numbered and settled its invoice.
   *
   * Two emails rather than one paragraph added to the welcome: a receipt is
   * a financial record people search their inbox for later, and burying it
   * inside "here is your password" is how it becomes unfindable.
   */
  try {
    await sendPaymentReceiptEmail({
      toEmail: email,
      contactName: contactName || null,
      company,
      projectName,
      amountLabel: formatCentsExact(amountPaid),
      paidOnLabel: receiptDate(),
      forLabel: metadata.paymentType === 'deposit' ? 'Deposit — Payment 1 of 3' : 'Project fee, paid in full',
      invoiceNumber: signingInvoiceNumber,
      standing: await projectStanding(project.id),
      dashboardUrl: `${resolveSiteUrl()}/client/${project.id}`,
    });
  } catch (receiptError) {
    console.error(`Signing receipt for project ${project.id} did not send:`, receiptError);
  }

  console.log(`Checkout completed: client=${client.id} project=${project.id}`);
}

/**
 * A client accepted a care plan and their card cleared. The subscription is
 * already running in Stripe by the time this arrives — all that's left is to
 * record which offer it belongs to and tell everyone.
 */
async function handleCarePlanStarted(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
) {
  const offerId = metadata.recurringOfferId;
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  const offer = await prisma.recurringOffer.findUnique({
    where: { id: offerId },
    include: {
      project: { include: { client: true } },
    },
  });

  if (!offer) {
    throw new Error(`Care plan webhook: offer ${offerId} not found`);
  }

  // Idempotency: a redelivered event must not re-announce a plan that's been
  // running for a month, nor email the client a second "you're all set".
  if (offer.status === 'active' && offer.stripeSubscriptionId === subscriptionId) {
    return;
  }

  const schedule = scheduleForOffer(offer);
  const label = planLabel(schedule.addOns);

  await prisma.recurringOffer.update({
    where: { id: offer.id },
    data: {
      status: 'active',
      acceptedAt: offer.acceptedAt ?? new Date(),
      stripeSubscriptionId: subscriptionId,
    },
  });

  // Checkout may have created the customer record — keep it, or the next
  // charge opens a second customer for the same company.
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (customerId && !offer.project.client.stripeCustomerId) {
    await prisma.client.update({
      where: { id: offer.project.clientId },
      data: { stripeCustomerId: customerId },
    });
  }

  await prisma.projectUpdate.create({
    data: {
      projectId: offer.projectId,
      title: 'Care plan active',
      description: `${label} is now running${
        schedule.freeMonths > 0
          ? `, starting with ${schedule.freeMonths} month${schedule.freeMonths === 1 ? '' : 's'} at no charge`
          : ''
      }. You'll get an itemized invoice by email each month.`,
      statusStage: offer.project.status,
      userId: null,
    },
  });

  // Clamped, not overflowed — see addMonthsClamped. A plan accepted on the
  // 31st with a free month was being told its first payment falls on 3 March.
  const firstCharge = addMonthsClamped(new Date(), schedule.freeMonths);
  const firstChargeLabel =
    schedule.freeMonths > 0
      ? `Your first payment of ${formatCents(schedule.discountedCents)} is due on ${invoiceDate(firstCharge)}.`
      : `Your card has been charged ${formatCents(schedule.discountedCents)} for the first month.`;

  await sendCarePlanStartedEmail({
    toEmail: offer.project.client.email,
    contactName: offer.project.client.contactName,
    company: offer.project.client.company,
    planLabel: label,
    scheduleLines: scheduleLines(schedule),
    firstChargeLabel,
  }).catch((error) => console.error('Failed to send care plan confirmation:', error));

  await notifyAdminsCarePlanStarted({
    projectId: offer.projectId,
    projectName: offer.project.name,
    clientCompany: offer.project.client.company,
    planLabel: label,
    monthlyLabel: formatCents(schedule.discountedCents),
    standardLabel: formatCents(schedule.monthlyCents),
    freeMonths: schedule.freeMonths,
  });

  console.log(`Care plan started: offer=${offer.id} subscription=${subscriptionId}`);
}

/**
 * Which subscription an invoice belongs to.
 *
 * The flat `invoice.subscription` field was removed in the Basil API version
 * this integration pins — it now hangs off `parent.subscription_details`. Both
 * are read so an event replayed from an older API version still resolves
 * rather than silently going unhandled.
 */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent?.subscription_details?.subscription;
  if (parent) return typeof parent === 'string' ? parent : parent.id;

  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (legacy) return typeof legacy === 'string' ? legacy : legacy.id;

  return null;
}

async function findOfferBySubscription(invoiceOrSubscriptionId: string | null) {
  if (!invoiceOrSubscriptionId) return null;
  return prisma.recurringOffer.findUnique({
    where: { stripeSubscriptionId: invoiceOrSubscriptionId },
    include: { project: { include: { client: true } } },
  });
}

/**
 * "August 4 – September 4, 2026", or null when Stripe sent no period.
 *
 * Read in UTC, because that is what the number means. Stripe sends the period
 * as a UTC instant on a day boundary, and rendering it in whatever timezone
 * the server happens to sit in walks it to the day before: a billing period
 * starting midnight UTC on the 4th prints as the 3rd anywhere west of
 * Greenwich. This string goes on an invoice email and into the PDF, so it is
 * the client's record of what they paid for — it cannot depend on where the
 * process ran.
 */
function periodLabel(invoice: Stripe.Invoice): string | null {
  if (!invoice.period_start || !invoice.period_end) return null;
  return billingPeriod(invoice.period_start, invoice.period_end);
}

/**
 * A monthly care-plan charge cleared: book it, and email the client the
 * itemized invoice.
 *
 * The invoice is the whole point of doing this here. A card statement says our
 * name and an amount — it doesn't say which months were covered, what the plan
 * includes, or that the introductory discount is still being applied. That
 * document has to arrive on its own every month, because nobody is going to
 * generate it by hand twelve times a year per client.
 */
async function handleCarePlanInvoicePaid(invoice: Stripe.Invoice) {
  const offer = await findOfferBySubscription(subscriptionIdFromInvoice(invoice));
  if (!offer) return; // not one of ours — subscriptions can exist for other reasons

  // The trial's opening invoice is $0. There is nothing to receipt, and the
  // "your plan is active" email already covered that moment.
  const amountPaid = invoice.amount_paid ?? 0;
  if (amountPaid <= 0) return;

  // A draft invoice has no ID yet, and the ID is the whole idempotency guard —
  // without one there is no way to tell a redelivery from a new month, so
  // nothing is booked rather than risking a duplicate charge record.
  const invoiceId = invoice.id;
  if (!invoiceId) {
    console.error(`Care plan invoice for offer ${offer.id} arrived with no ID; skipping`);
    return;
  }

  // Idempotency: Stripe redelivers, and a second delivery must not send the
  // client a duplicate invoice for a month they already have one for.
  const alreadyBooked = await prisma.recurringPayment.findUnique({
    where: { stripeInvoiceId: invoiceId },
  });
  if (alreadyBooked) return;

  const standardAmount = invoice.subtotal ?? offer.monthlyCents;
  const schedule = scheduleForOffer(offer);
  const label = planLabel(schedule.addOns);
  const period = periodLabel(invoice);
  const discount = discountLabel(offer);

  try {
    await prisma.recurringPayment.create({
      data: {
        offerId: offer.id,
        amount: amountPaid,
        standardAmount,
        stripeInvoiceId: invoiceId,
        invoiceNumber: invoice.number ?? null,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      },
    });
  } catch (error) {
    // Two deliveries racing each other: the unique index on stripeInvoiceId is
    // the real guard, and losing that race means the other delivery is already
    // sending the email.
    console.warn(`Care plan invoice ${invoice.id} already booked:`, error);
    return;
  }

  const company = offer.project.client.company;
  const saved = standardAmount - amountPaid;

  try {
    const pdf = await buildCarePlanInvoicePdf({
      invoiceNumber: invoice.number || offer.id.slice(0, 8).toUpperCase(),
      company,
      contactName: offer.project.client.contactName,
      addOnKeys: schedule.addOns,
      standardCents: standardAmount,
      chargedCents: amountPaid,
      periodLabel: period,
      discountLabel: discount,
      date: invoiceDate(new Date()),
    });

    await sendCarePlanInvoiceEmail({
      toEmail: offer.project.client.email,
      contactName: offer.project.client.contactName,
      company,
      planLabel: label,
      amountLabel: formatCents(amountPaid),
      periodLabel: period,
      discountLabel: saved > 0 ? discount : null,
      savedLabel: saved > 0 ? formatCents(saved) : null,
      invoicePdf: Buffer.from(pdf),
      fileName: `${company.replace(/[^a-z0-9]/gi, '-')}-care-plan-invoice.pdf`,
    });
  } catch (error) {
    // The money is booked either way. A failed PDF or send is worth shouting
    // about, but it must not make Stripe retry a payment we already recorded.
    console.error(`Failed to send care plan invoice for offer ${offer.id}:`, error);
  }

  console.log(`Care plan invoice paid: offer=${offer.id} amount=${amountPaid}`);
}

/** A declined monthly charge. Stripe retries; both sides get told. */
async function handleCarePlanInvoiceFailed(invoice: Stripe.Invoice) {
  const offer = await findOfferBySubscription(subscriptionIdFromInvoice(invoice));
  if (!offer) return;

  const schedule = scheduleForOffer(offer);
  const label = planLabel(schedule.addOns);
  const amountLabel = formatCents(invoice.amount_due ?? schedule.discountedCents);

  await sendCarePlanPaymentFailedEmail({
    toEmail: offer.project.client.email,
    contactName: offer.project.client.contactName,
    company: offer.project.client.company,
    planLabel: label,
    amountLabel,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
  }).catch((error) => console.error('Failed to send care plan failure notice:', error));

  await notifyAdminsCarePlanPaymentFailed({
    projectId: offer.projectId,
    clientCompany: offer.project.client.company,
    planLabel: label,
    amountLabel,
  });
}

/**
 * The subscription is over — canceled from here, canceled in Stripe, or ended
 * after too many failed retries. Whichever it was, the plan stops being
 * "active" so the project page doesn't keep claiming money is coming in.
 */
async function handleSubscriptionEnded(subscription: Stripe.Subscription) {
  const offer = await prisma.recurringOffer.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    include: { project: { include: { client: true } } },
  });
  if (!offer || offer.status === 'canceled') return;

  await prisma.recurringOffer.update({
    where: { id: offer.id },
    data: { status: 'canceled', canceledAt: offer.canceledAt ?? new Date() },
  });

  console.log(`Care plan ended: offer=${offer.id} subscription=${subscription.id}`);

  /*
   * And somebody is told.
   *
   * This handler used to end at the log line above. A care plan starting
   * notifies the studio, and a failed monthly charge notifies the studio and
   * the client — but the plan actually ENDING, which is the outcome those
   * failures lead to, notified nobody. Stripe gives up after its retry
   * schedule and the subscription is deleted, so the last thing anyone heard
   * about that client was "payment failed, Stripe will retry automatically".
   *
   * Recurring revenue is the only kind that disappears without an event:
   * nothing bounces, nobody complains, next month is quietly smaller.
   */
  const schedule = scheduleForOffer(offer);
  const reason = subscription.cancellation_details?.reason ?? null;

  /*
   * The client, who was the last to know and had been told the opposite.
   *
   * sendCarePlanPaymentFailedEmail ends with "Your plan stays active in the
   * meantime" — true when it is sent, and until now the last thing they ever
   * heard. Stripe exhausts its retries, deletes the subscription, and a client
   * whose card expired goes on believing their hosting and support are covered
   * because we told them they were.
   */
  await sendCarePlanEndedEmail({
    toEmail: offer.project.client.email,
    contactName: offer.project.client.contactName,
    company: offer.project.client.company,
    planLabel: planLabel(schedule.addOns),
    reason,
    restartUrl: `${resolveSiteUrl()}/client/${offer.projectId}`,
  }).catch((error) => console.error('Care plan ended client email failed:', error));

  await notifyAdminsCarePlanEnded({
    projectId: offer.projectId,
    clientCompany: offer.project.client.company,
    planLabel: planLabel(schedule.addOns),
    monthlyLabel: formatCents(schedule.discountedCents),
    // 'cancellation_requested' reads very differently from 'payment_failed',
    // and it is the only thing distinguishing a decision from a loss.
    reason,
  }).catch((error) => console.error('Care plan ended notice failed:', error));
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
  // A one-off charge settles its own invoice and nothing else. It must not
  // read as a payment toward the project's contracted price — see
  // amountPaidTowardProject() in lib/billing.ts, which is what keeps a $2,000
  // change request from marking a $20,000 build 10% closer to paid off.
  const type =
    metadata.paymentType === 'deposit'
      ? 'deposit'
      : metadata.paymentType === 'custom'
      ? 'custom'
      : 'balance';
  const invoiceId = metadata.invoiceId || null;

  // One transaction for the money and everything the money settles. The
  // Payment row is the idempotency anchor for this session id — if it
  // committed while the instalment or invoice update failed, the guard at
  // the top would swallow the redelivery that could have finished the job,
  // leaving a paid instalment reading "due" forever. Together they commit
  // or together they retry.
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        projectId,
        amount: amountPaid,
        type,
        stripeSessionId: session.id,
        invoiceId,
      },
    });

    // An instalment checkout carries its row's id; settle that exact row so
    // the schedule the client sees ("Payment 2 of 3 — paid") moves the
    // moment the money does. Scoped to not-yet-paid so a redelivered event
    // can't rewrite paidAt.
    if (metadata.instalmentId) {
      await tx.instalment.updateMany({
        where: { id: metadata.instalmentId, projectId, status: { not: 'paid' } },
        data: { status: 'paid', paidAt: new Date() },
      });
    } else if (type === 'deposit' || type === 'balance') {
      // Contract-price money that arrived OUTSIDE the instalment flow — the
      // legacy collect-balance link, a manually minted checkout. Apply it to
      // the schedule oldest-first, whole rows only, so the books and the
      // "Payment N of 3" display can't drift apart just because ops used an
      // older button.
      const openRows = await tx.instalment.findMany({
        where: { projectId, status: { in: ['scheduled', 'due'] } },
        orderBy: { index: 'asc' },
      });
      let remaining = amountPaid;
      for (const row of openRows) {
        if (remaining < row.amountCents) break;
        remaining -= row.amountCents;
        await tx.instalment.update({
          where: { id: row.id },
          data: { status: 'paid', paidAt: new Date() },
        });
      }
    }

    // Settling the invoice is what takes "Pay now" off the client's
    // dashboard and off ours. Scoped to a still-open invoice so a
    // redelivered event can't rewrite when it was paid.
    if (invoiceId) {
      await tx.invoice.updateMany({
        where: { id: invoiceId, status: 'open' },
        data: { status: 'paid', paidAt: new Date() },
      });
    }
  });

  // formatCentsExact rather than formatCents: a custom charge can carry
  // cents, and a receipt line that rounds them disagrees with the card. The
  // deposits and balances that come through here are whole dollars, so it
  // renders them exactly as before.
  const amountLabel = formatCentsExact(amountPaid);

  await prisma.projectUpdate.create({
    data: {
      projectId,
      title: type === 'deposit' ? 'Deposit received' : 'Payment received',
      description:
        type === 'custom' && metadata.invoiceNumber
          ? `We've received your payment of ${amountLabel} for invoice ${metadata.invoiceNumber}. Thank you!`
          : `We've received your payment of ${amountLabel}. Thank you!`,
      statusStage: project.status,
      userId: null,
    },
  });

  await notifyAdminsPaymentReceived({
    projectId,
    projectName: project.name,
    clientCompany: project.client.company,
    amountLabel,
  });

  /*
   * The receipt, to the one party that wasn't being told.
   *
   * By this line the money is in the ledger, the instalment and invoice are
   * settled, the dashboard has a timeline entry and the admins have an email.
   * The client who was just charged had none of it — while care-plan
   * subscribers have always had a receipt for every monthly charge, so the
   * payments going unacknowledged were the large ones.
   *
   * Best-effort and last. Everything above has committed; throwing here would
   * make Stripe redeliver an event whose work is already done, and the
   * idempotency guard at the top would swallow the retry anyway.
   */
  try {
    if (project.client.email) {
      const settled = metadata.instalmentId
        ? await prisma.instalment.findUnique({
            where: { id: metadata.instalmentId },
            select: { label: true, invoiceNumber: true },
          })
        : null;

      await sendPaymentReceiptEmail({
        toEmail: project.client.email,
        contactName: project.client.contactName,
        company: project.client.company,
        projectName: project.name,
        amountLabel,
        paidOnLabel: receiptDate(),
        forLabel:
          settled?.label ??
          (type === 'custom'
            ? metadata.invoiceNumber
              ? `Invoice ${metadata.invoiceNumber}`
              : 'Additional work'
            : type === 'deposit'
            ? 'Project deposit'
            : 'Project balance'),
        invoiceNumber: metadata.invoiceNumber || settled?.invoiceNumber || null,
        // A one-off charge settles its own invoice and says nothing about the
        // project schedule, so it claims nothing about the build either way.
        standing: type === 'custom' ? { kind: 'unrelated' } : await projectStanding(projectId),
        dashboardUrl: `${resolveSiteUrl()}/client/${projectId}`,
      });
    }
  } catch (receiptError) {
    console.error(`Receipt for project ${projectId} did not send:`, receiptError);
  }

  /*
   * And the invoice PDF stops asking for money that has arrived.
   *
   * The stored document is what a client's bookkeeper files, and it said
   * "Amount due: $1,200" forever — including on the copy they download from
   * their own dashboard weeks after paying. Nothing regenerated it, because
   * nothing ever had a reason to look at it again after the send.
   *
   * Best-effort and after the ledger, for the same reason as the receipt
   * above: the money is already recorded, and throwing over a document that
   * can be rebuilt by pressing a button would make Stripe redeliver an event
   * whose real work is done.
   */
  if (invoiceId) {
    try {
      const settledInvoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          number: true,
          description: true,
          lineItems: true,
          createdAt: true,
          paidAt: true,
          client: { select: { company: true, contactName: true } },
        },
      });
      if (settledInvoice?.paidAt) {
        await restoreInvoicePdfAsPaid(prisma, settledInvoice, settledInvoice.paidAt);
      }
    } catch (pdfError) {
      console.error(`Receipt PDF for invoice ${invoiceId} was not rebuilt:`, pdfError);
    }
  }

  console.log(`Existing-project payment: project=${projectId} amount=${amountPaid}`);
}
