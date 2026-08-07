-- When a deal was actually won.
--
-- Every "won this week" figure in the app read `updatedAt`, which is the last
-- time *anything* on the row changed. Adding a note to a deal closed in March
-- re-dated the win to today: it re-entered the period's won count and revenue
-- and jumped to the top of the commission log carrying a close date that was
-- really a last-touched date. A commission figure is the wrong number to
-- infer.
--
-- Nullable rather than defaulted: a lead that has not been won has no close
-- date, and inventing one is how the next version of this bug gets written.
ALTER TABLE "leads" ADD COLUMN "wonAt" TIMESTAMP(3);

-- Backfill from `updatedAt` for deals already closed.
--
-- It is the same approximation these figures have always been built on, so
-- this changes no number that is on screen today — it freezes them. From here
-- a further edit to one of these rows stops moving its close date, which is
-- the whole point. New wins get a real stamp at the moment of transition.
--
-- Rows that are won but somehow miss this backfill are not stranded: every
-- reader falls back to `updatedAt` when `wonAt` is null.
UPDATE "leads" SET "wonAt" = "updatedAt" WHERE "status" = 'won';
