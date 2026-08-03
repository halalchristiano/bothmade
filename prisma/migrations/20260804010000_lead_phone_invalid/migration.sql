-- Set when a call reaches a dead or wrong number ("wrong number" call
-- outcome). The phone equivalent of emailDeliveryFailedAt: flagged leads drop
-- out of the callable band instead of being re-dialed.
ALTER TABLE "leads" ADD COLUMN     "phoneInvalidAt" TIMESTAMP(3);
