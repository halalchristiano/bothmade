-- Three-instalment payment schedule, seeded per project and labelled the way
-- the client reads it: "Payment 1 of 3". Under $20,000 a project bills
-- 50/25/25; at $20,000 and above, 40/30/30 — both over the same gates
-- (signing, design approval, ready for launch), which is what lets one
-- table describe every project.
--
-- Additive only. Existing projects simply have no instalment rows and keep
-- the legacy deposit/balance flow; new projects are seeded at creation. A
-- deploy that lands this before the code that writes it is a no-op rather
-- than an outage.

CREATE TABLE "instalments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "invoiceNumber" TEXT,
    "stripeSessionId" TEXT,
    "paymentUrl" TEXT,
    "invoicedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instalments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "instalments_invoiceNumber_key" ON "instalments"("invoiceNumber");
CREATE UNIQUE INDEX "instalments_stripeSessionId_key" ON "instalments"("stripeSessionId");
CREATE UNIQUE INDEX "instalments_projectId_index_key" ON "instalments"("projectId", "index");
CREATE INDEX "instalments_projectId_idx" ON "instalments"("projectId");

ALTER TABLE "instalments" ADD CONSTRAINT "instalments_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Consumer clients get the consumer form of the agreement — the statutory
-- 14-day cancellation right cannot be excluded against an individual, so the
-- flag has to exist before the contract is generated, not after.
ALTER TABLE "leads" ADD COLUMN "isConsumer" BOOLEAN NOT NULL DEFAULT false;
