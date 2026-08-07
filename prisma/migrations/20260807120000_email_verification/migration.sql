-- Checking a guessed address before sending to it.
--
-- Roughly three quarters of the leads in this book carry an address nobody
-- ever saw published — `info@` worked out from the company's domain because
-- that is right most of the time. Most of the time is not all of the time,
-- and every wrong one is a hard bounce. The industry danger line for bounce
-- rate is about 2%; a list that is three quarters guesswork sits near ten,
-- which is what restricted the sending account.
--
-- These columns hold what a verifier said, so the answer is fetched once and
-- then used by every later send rather than paid for again each time. The
-- sub-status is stored verbatim and never interpreted: it is there so a
-- surprising verdict can be explained after the fact.
ALTER TABLE "leads" ADD COLUMN "emailVerificationStatus" TEXT;
ALTER TABLE "leads" ADD COLUMN "emailVerificationSubStatus" TEXT;
ALTER TABLE "leads" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- The sender asks "which of these have not been checked yet" before every
-- batch, over a table of thousands. Partial, because the rows it never needs
-- to find are the ones already verified.
CREATE INDEX "leads_emailVerifiedAt_idx" ON "leads" ("emailVerifiedAt") WHERE "emailVerifiedAt" IS NULL;
