import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The care-plan half of the Stripe webhook.
 *
 * A subscription bills forever and nobody watches a Stripe dashboard, so this
 * handler is the only thing standing between a monthly charge and the client
 * getting a document that says what it was for. The failures that matter are
 * all silent ones: a redelivered event emailing a second invoice for the same
 * month, a $0 trial invoice sent out as a receipt, or an invoice arriving in
 * an API version whose subscription field moved and going unmatched.
 */

const constructWebhookEvent = vi.fn();

const prisma = {
  recurringOffer: { findUnique: vi.fn(), update: vi.fn() },
  recurringPayment: { findUnique: vi.fn(), create: vi.fn() },
  client: { update: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  projectUpdate: { create: vi.fn() },
  project: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  payment: { create: vi.fn(), findUnique: vi.fn() },
  emailPreferences: { create: vi.fn() },
  lead: { update: vi.fn() },
  teamMessage: { create: vi.fn() },
  user: { findFirst: vi.fn() },
};

vi.mock('@/lib/stripe', () => ({
  constructWebhookEvent: (...args: unknown[]) => constructWebhookEvent(...args),
}));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({
  generateRandomPassword: () => 'generated-password',
  hashPassword: async () => 'hashed-password',
}));
vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: vi.fn(),
  sendCarePlanOfferEmail: vi.fn(),
  sendCarePlanStartedEmail: vi.fn(async () => true),
  sendCarePlanInvoiceEmail: vi.fn(async () => true),
  sendCarePlanPaymentFailedEmail: vi.fn(async () => true),
}));
vi.mock('@/lib/notify', () => ({
  notifyAdminsPaymentReceived: vi.fn(),
  notifyAdminsCarePlanStarted: vi.fn(),
  notifyAdminsCarePlanPaymentFailed: vi.fn(),
}));
vi.mock('@/lib/invoice-pdf', () => ({
  buildCarePlanInvoicePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

const { POST } = await import('@/app/api/webhooks/stripe/route');
const {
  sendCarePlanStartedEmail,
  sendCarePlanInvoiceEmail,
  sendCarePlanPaymentFailedEmail,
} = await import('@/lib/email');
const { notifyAdminsCarePlanStarted, notifyAdminsCarePlanPaymentFailed } = await import('@/lib/notify');
const { buildCarePlanInvoicePdf } = await import('@/lib/invoice-pdf');

function request(body = '{}', signature = 'sig') {
  return {
    text: async () => body,
    headers: { get: (name: string) => (name === 'stripe-signature' ? signature : null) },
  } as unknown as Parameters<typeof POST>[0];
}

const OFFER = {
  id: 'offer_1',
  projectId: 'proj_1',
  addOns: 'hosting',
  monthlyCents: 20000,
  discountType: 'percent',
  discountValue: 25,
  freeMonths: 2,
  discountMonths: 12,
  status: 'sent',
  note: null,
  token: 'tok_1',
  acceptedAt: null,
  canceledAt: null,
  stripeSubscriptionId: null,
  project: {
    id: 'proj_1',
    name: 'Linpotia Cafe — Website',
    status: 'launch',
    clientId: 'client_1',
    addOns: 'seo,hosting',
    client: {
      id: 'client_1',
      email: 'frell@linpotia.com',
      company: 'Linpotia Cafe',
      contactName: 'Frell Handa',
      stripeCustomerId: null,
    },
  },
};

function checkoutCompleted(overrides: Record<string, unknown> = {}) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_care_1',
        metadata: { recurringOfferId: 'offer_1', projectId: 'proj_1', paymentType: 'recurring' },
        subscription: 'sub_1',
        customer: 'cus_1',
        amount_total: 0,
        ...overrides,
      },
    },
  };
}

/** An invoice in the Basil shape, where the subscription hangs off `parent`. */
function invoiceEvent(
  type: 'invoice.payment_succeeded' | 'invoice.payment_failed',
  overrides: Record<string, unknown> = {}
) {
  return {
    type,
    data: {
      object: {
        id: 'in_1',
        number: 'BOTH-0001',
        amount_paid: 15000,
        amount_due: 15000,
        subtotal: 20000,
        hosted_invoice_url: 'https://stripe.test/invoice',
        period_start: Math.floor(Date.UTC(2026, 7, 4) / 1000),
        period_end: Math.floor(Date.UTC(2026, 8, 4) / 1000),
        parent: { subscription_details: { subscription: 'sub_1' } },
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  prisma.recurringOffer.findUnique.mockResolvedValue(OFFER);
  prisma.recurringOffer.update.mockResolvedValue({ ...OFFER, status: 'active' });
  prisma.recurringPayment.findUnique.mockResolvedValue(null);
  prisma.recurringPayment.create.mockResolvedValue({});
  prisma.projectUpdate.create.mockResolvedValue({});
  prisma.client.update.mockResolvedValue({});
});

describe('a client accepting a care plan', () => {
  beforeEach(() => constructWebhookEvent.mockReturnValue(checkoutCompleted()));

  it('switches the offer on and remembers which subscription it is', async () => {
    await POST(request());

    expect(prisma.recurringOffer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'offer_1' },
        data: expect.objectContaining({ status: 'active', stripeSubscriptionId: 'sub_1' }),
      })
    );
  });

  it('creates no project and no client — both already exist', async () => {
    await POST(request());

    expect(prisma.project.create).not.toHaveBeenCalled();
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('never books this against the project balance', async () => {
    // A recurring charge in `payments` would make the project read as overpaid,
    // by a growing amount, every month forever.
    await POST(request());

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('keeps the Stripe customer checkout just created, so the next charge reuses it', async () => {
    await POST(request());

    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: 'client_1' },
      data: { stripeCustomerId: 'cus_1' },
    });
  });

  it('emails the client the schedule, ending with the standard rate', async () => {
    await POST(request());

    const sent = vi.mocked(sendCarePlanStartedEmail).mock.calls[0][0];
    expect(sent.toEmail).toBe('frell@linpotia.com');
    expect(sent.scheduleLines.at(-1)?.period).toBe('Month 15 onward');
    expect(sent.scheduleLines.at(-1)?.detail).toContain('$200');
    // Two months covered, so nothing is taken today.
    expect(sent.firstChargeLabel).toMatch(/first payment of \$150 is due/i);
  });

  it('tells the studio, with both the introductory and the standard rate', async () => {
    await POST(request());

    expect(notifyAdminsCarePlanStarted).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyLabel: '$150', standardLabel: '$200', freeMonths: 2 })
    );
  });

  it('does it all again for nobody when Stripe redelivers', async () => {
    prisma.recurringOffer.findUnique.mockResolvedValue({
      ...OFFER,
      status: 'active',
      stripeSubscriptionId: 'sub_1',
    });

    await POST(request());

    expect(prisma.recurringOffer.update).not.toHaveBeenCalled();
    expect(sendCarePlanStartedEmail).not.toHaveBeenCalled();
    expect(notifyAdminsCarePlanStarted).not.toHaveBeenCalled();
  });
});

describe('a monthly charge clearing', () => {
  beforeEach(() => constructWebhookEvent.mockReturnValue(invoiceEvent('invoice.payment_succeeded')));

  it('books it against the plan, not against the project', async () => {
    await POST(request());

    expect(prisma.recurringPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        offerId: 'offer_1',
        amount: 15000,
        standardAmount: 20000,
        stripeInvoiceId: 'in_1',
      }),
    });
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('emails the itemized invoice, because a card statement says nothing', async () => {
    await POST(request());

    const sent = vi.mocked(sendCarePlanInvoiceEmail).mock.calls[0][0];
    expect(sent.toEmail).toBe('frell@linpotia.com');
    expect(sent.amountLabel).toBe('$150');
    expect(sent.periodLabel).toBe('August 4, 2026 – September 4, 2026');
    expect(sent.invoicePdf).toBeInstanceOf(Buffer);
  });

  it('shows the discount on the invoice while it is still running', async () => {
    await POST(request());

    const pdf = vi.mocked(buildCarePlanInvoicePdf).mock.calls[0][0];
    expect(pdf.standardCents).toBe(20000);
    expect(pdf.chargedCents).toBe(15000);
    expect(pdf.discountLabel).toMatch(/25% off/);
  });

  it('sends nothing for the $0 invoice that opens a trial', async () => {
    constructWebhookEvent.mockReturnValue(
      invoiceEvent('invoice.payment_succeeded', { amount_paid: 0, subtotal: 0 })
    );

    await POST(request());

    expect(prisma.recurringPayment.create).not.toHaveBeenCalled();
    expect(sendCarePlanInvoiceEmail).not.toHaveBeenCalled();
  });

  it('does not email a second copy when Stripe redelivers the same invoice', async () => {
    prisma.recurringPayment.findUnique.mockResolvedValue({ id: 'rp_1' });

    await POST(request());

    expect(prisma.recurringPayment.create).not.toHaveBeenCalled();
    expect(sendCarePlanInvoiceEmail).not.toHaveBeenCalled();
  });

  it('still books the money when the invoice email fails', async () => {
    vi.mocked(sendCarePlanInvoiceEmail).mockRejectedValueOnce(new Error('mailbox full'));

    const response = await POST(request());

    // A 500 makes Stripe retry a payment that is already recorded.
    expect(response.status).toBe(200);
    expect(prisma.recurringPayment.create).toHaveBeenCalled();
  });

  it('ignores subscriptions that are not care plans', async () => {
    prisma.recurringOffer.findUnique.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(prisma.recurringPayment.create).not.toHaveBeenCalled();
  });

  it('still finds the subscription on an invoice from the older API shape', async () => {
    // Events replayed from before the field moved must not go unmatched — an
    // unmatched invoice is a month the client is billed for and never told about.
    constructWebhookEvent.mockReturnValue(
      invoiceEvent('invoice.payment_succeeded', { parent: null, subscription: 'sub_1' })
    );

    await POST(request());

    expect(prisma.recurringOffer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripeSubscriptionId: 'sub_1' } })
    );
    expect(prisma.recurringPayment.create).toHaveBeenCalled();
  });
});

describe('a monthly charge failing', () => {
  beforeEach(() => constructWebhookEvent.mockReturnValue(invoiceEvent('invoice.payment_failed')));

  it('tells the client, and points them somewhere they can fix it', async () => {
    await POST(request());

    const sent = vi.mocked(sendCarePlanPaymentFailedEmail).mock.calls[0][0];
    expect(sent.toEmail).toBe('frell@linpotia.com');
    expect(sent.hostedInvoiceUrl).toBe('https://stripe.test/invoice');
  });

  it('tells the studio, since a lapsing plan is revenue nobody notices leaving', async () => {
    await POST(request());

    expect(notifyAdminsCarePlanPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ clientCompany: 'Linpotia Cafe', amountLabel: '$150' })
    );
  });

  it('books nothing — no money moved', async () => {
    await POST(request());

    expect(prisma.recurringPayment.create).not.toHaveBeenCalled();
  });
});

describe('a subscription ending', () => {
  beforeEach(() =>
    constructWebhookEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    })
  );

  it('stops the plan reading as active', async () => {
    prisma.recurringOffer.findUnique.mockResolvedValue({ ...OFFER, status: 'active' });

    await POST(request());

    expect(prisma.recurringOffer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'canceled' }) })
    );
  });

  it('leaves an already-canceled plan alone', async () => {
    prisma.recurringOffer.findUnique.mockResolvedValue({
      ...OFFER,
      status: 'canceled',
      canceledAt: new Date(),
    });

    await POST(request());

    expect(prisma.recurringOffer.update).not.toHaveBeenCalled();
  });
});
