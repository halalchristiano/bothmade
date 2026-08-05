-- An invoice gets somewhere to go after it has been raised.
--
-- Until now it had nowhere. A charge raised in error stayed on the books and
-- stayed payable; money given back was given back in the Stripe dashboard and
-- nowhere else. The `voidedAt` column below already existed and the billing
-- page already rendered a "Void" badge — nothing in the system could set
-- either, which is a worse place to be than having neither, because the
-- interface was promising a button that was never wired up.
--
-- Nothing here rewrites an existing row: every column is nullable or defaults
-- to zero, and an invoice that has not been voided or refunded reads exactly
-- as it did before. Idempotent throughout, so a half-applied run does not
-- block every migration after it.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "voidedById" TEXT;

-- Cumulative rather than a single refund row: refunds can be partial and can
-- happen more than once, and the ceiling has to be checked against the total
-- already returned. Two partial refunds are each valid on their own and can
-- still add up to more than the client ever paid.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "refundedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "refundReason" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "refundMethod" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripeRefundId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "refundedById" TEXT;

-- SET NULL rather than CASCADE: a staff account being deleted must never take
-- the invoice it touched with it. The record outlives the employment.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_voidedById_fkey') THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_voidedById_fkey"
      FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_refundedById_fkey') THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_refundedById_fkey"
      FOREIGN KEY ("refundedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
