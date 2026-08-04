-- Recurring care plans: the monthly services (hosting, maintenance, growth)
-- a client can be signed onto after the build, and the monthly invoices that
-- follow once they are.
--
-- Kept out of "payments" on purpose: that table is what a project's balance is
-- derived from, so a monthly charge booked there would show every subscribed
-- project as overpaid, growing further out every month.

CREATE TABLE "recurring_offers" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "addOns" TEXT NOT NULL,
    "monthlyCents" INTEGER NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'percent',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "freeMonths" INTEGER NOT NULL DEFAULT 0,
    "discountMonths" INTEGER NOT NULL DEFAULT 12,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    -- Same capability-token generation as leads and projects already use, so a
    -- row created outside the application still gets an unguessable one.
    "token" TEXT NOT NULL DEFAULT (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "stripeCheckoutSessionId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeCouponId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_offers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recurring_offers_token_key" ON "recurring_offers"("token");
CREATE UNIQUE INDEX "recurring_offers_stripeCheckoutSessionId_key" ON "recurring_offers"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "recurring_offers_stripeSubscriptionId_key" ON "recurring_offers"("stripeSubscriptionId");
CREATE INDEX "recurring_offers_projectId_createdAt_idx" ON "recurring_offers"("projectId", "createdAt");
CREATE INDEX "recurring_offers_status_idx" ON "recurring_offers"("status");

ALTER TABLE "recurring_offers" ADD CONSTRAINT "recurring_offers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_offers" ADD CONSTRAINT "recurring_offers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "recurring_payments" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "standardAmount" INTEGER NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "hostedInvoiceUrl" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_payments_pkey" PRIMARY KEY ("id")
);

-- The idempotency guard: Stripe redelivers invoice events, and without this a
-- redelivery would email the client a second copy of the same monthly invoice.
CREATE UNIQUE INDEX "recurring_payments_stripeInvoiceId_key" ON "recurring_payments"("stripeInvoiceId");
CREATE INDEX "recurring_payments_offerId_createdAt_idx" ON "recurring_payments"("offerId", "createdAt");

ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "recurring_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
