-- Somebody tried to open a mockup link that had already expired.
--
-- This is the most actionable fact in the pipeline and it was being thrown
-- away. A prospect clicking a link we sent them is a person actively trying to
-- look at the work — and the ones who do it a month later are the slow,
-- considered deals still worth having. The page told them "reply to the email
-- it came from and we'll sort it out", and unless they did, nobody here ever
-- found out it had happened.
--
-- Counted rather than flagged: four attempts and one attempt are different
-- amounts of interest, and the difference decides how fast somebody rings.
--
-- Both columns are additive with defaults, so every existing mockup reads as
-- "nobody has hit a dead link", which is the truth as far as anyone knows.
ALTER TABLE "lead_mockups" ADD COLUMN "expiredViewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "lead_mockups" ADD COLUMN "lastExpiredViewAt" TIMESTAMP(3);
