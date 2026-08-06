-- What a change order was called when it was raised, and what the contract
-- said about it at the time.
--
-- Section 4 makes "changes consistent with the originally agreed scope" free
-- inside the revision allowance and everything else billable, so the minor /
-- major call is the hinge the whole ruling turns on — and it was being made
-- in somebody's head, then thrown away. The verdict is stored alongside it
-- because the project moves through its gates: the same request judged six
-- weeks later gets a different answer, and what a dispute asks is what was
-- true on the day it was agreed.
--
-- Additive and nullable-or-defaulted, so existing change orders keep working.
-- "major" is the default for rows raised before this existed: they were all
-- raised as fees, and a fee is what a major change produces.
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "changeScale" TEXT NOT NULL DEFAULT 'major';
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "verdictRuling" TEXT;
ALTER TABLE "change_orders" ADD COLUMN IF NOT EXISTS "verdictStage" TEXT;
