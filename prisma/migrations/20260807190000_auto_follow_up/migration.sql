-- The second touch after a call, scheduled by the machine.
--
-- A call that ends "not right now" used to end there. The rep books a
-- follow-up date, the date arrives on a list of forty other dates, and the
-- second email — the one that converts — never gets written. These two
-- columns are that email: a due date stamped when the call is logged, and a
-- sent date so a cron running twice cannot send twice.
--
-- Both nullable with no default, so every existing lead starts outside the
-- sequence. Nothing is scheduled retroactively: a lead called three weeks ago
-- must not receive a "following up on our call" email tomorrow.
ALTER TABLE "leads" ADD COLUMN "autoFollowUpDueAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "autoFollowUpSentAt" TIMESTAMP(3);

-- The cron asks one question daily — "what is due and not yet sent" — over a
-- table of thousands. Partial, because a lead outside the sequence or already
-- sent to is a row it never needs to find.
CREATE INDEX "leads_autoFollowUpDueAt_idx" ON "leads" ("autoFollowUpDueAt")
  WHERE "autoFollowUpDueAt" IS NOT NULL AND "autoFollowUpSentAt" IS NULL;
