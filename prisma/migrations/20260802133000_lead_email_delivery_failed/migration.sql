-- Tracks when a send attempt to a lead's email actually failed, so it can be surfaced as "call instead"
ALTER TABLE "leads" ADD COLUMN "emailDeliveryFailedAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "emailDeliveryFailedReason" TEXT;
