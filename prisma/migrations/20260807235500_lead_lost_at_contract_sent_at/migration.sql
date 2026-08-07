-- The other two dates that were being inferred from `updatedAt`.
--
-- `wonAt` (see 20260807230000_lead_won_at) fixed one half of this: a deal's
-- close date no longer moves when somebody edits the row. These are the two
-- that were left.
--
-- A deal that was lost has a decision date too, and "which reasons did we
-- lose to this quarter" was reading `updatedAt` for it — so correcting a typo
-- on a lost lead moved it into the current quarter and counted its reason a
-- second time. The analytics page dates won and lost together, which is why
-- it could not be fixed by `wonAt` alone.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lostAt" TIMESTAMP(3);

-- And an unsigned contract: "N days with them" was N days since the row was
-- last written, so emailing a chase reset the counter to zero and the row
-- reported that they had only just received it. They had not — we had just
-- contacted them again, which is the opposite of the thing being measured.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contractSentAt" TIMESTAMP(3);

-- Backfilled from `updatedAt`, exactly as `wonAt` was, and for the same
-- reason: it is the approximation these numbers were already built on, so
-- nothing on screen changes today. It freezes them. From here a further edit
-- stops moving either date, and every new close and send writes a real one.
--
-- Readers fall back to `updatedAt` where these are null, so a row the
-- backfill misses is no worse off than it is today.
UPDATE "leads" SET "lostAt" = "updatedAt" WHERE "status" = 'lost' AND "lostAt" IS NULL;
UPDATE "leads" SET "contractSentAt" = "updatedAt" WHERE "contractStatus" = 'sent' AND "contractSentAt" IS NULL;

-- Reporting asks for these as date ranges ("what closed this quarter"), the
-- same access pattern `clientTakenOnAt` is already indexed for.
CREATE INDEX IF NOT EXISTS "leads_lostAt_idx" ON "leads"("lostAt");
