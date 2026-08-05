-- "Not this week."
--
-- Priorities lists every project that needs attention and offers no way to
-- say you have seen it. A row you genuinely cannot act on today — the client
-- is on holiday, the invoice is going out Monday, the launch is booked for
-- next month — sits at the top with everything else, so the list gets longer
-- than it is useful and the honest response is to stop opening it.
--
-- One nullable timestamp. Null means the row is live, which is every project
-- that exists today, so there is nothing to backfill.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "prioritySnoozedUntil" TIMESTAMP(3);

-- Read on every load of the priorities list, where the filter is always
-- "null, or already in the past".
CREATE INDEX IF NOT EXISTS "projects_prioritySnoozedUntil_idx" ON "projects"("prioritySnoozedUntil");
