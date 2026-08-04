-- Custom charges: a one-off amount someone on the team types in for an
-- existing customer, with the invoice raised on the spot rather than
-- reconstructed from a proposal later.
--
-- Additive only. Nothing existing changes shape, and `payments` gains one
-- nullable column, so a deploy that lands this before the code that writes
-- to it is a no-op rather than an outage.

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'open',
    "pdfUrl" TEXT,
    "paymentUrl" TEXT,
    "stripePaymentLinkId" TEXT,
    "issuedById" TEXT,
    "sentToEmail" TEXT,
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- Two invoices sharing a number is the accounting error nobody can untangle
-- afterwards, so the database refuses it rather than trusting the generator.
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");
CREATE INDEX "invoices_clientId_idx" ON "invoices"("clientId");
CREATE INDEX "invoices_projectId_idx" ON "invoices"("projectId");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Links a settled payment back to the charge it paid. Nullable, and every
-- existing row stays null: those are deposits and balances against a
-- project's contracted price, which is exactly what a null here means.
ALTER TABLE "payments" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
