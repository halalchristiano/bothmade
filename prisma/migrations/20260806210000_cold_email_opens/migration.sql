-- The middle of the pipeline was invisible.
--
-- A lead that was emailed and said nothing looked identical to every other
-- lead that was emailed and said nothing — whether it never arrived, or was
-- read six times and forwarded to somebody's boss. Four hundred businesses in
-- one undifferentiated pile, called in whatever order the list happened to be
-- sorted in.
--
-- A one-pixel image on the cold email writes these three columns. What they
-- are allowed to mean is decided at read time in lib/lead-opens.ts: one open
-- proves delivery, repeated opens across time are a person, and the call
-- queue ranks on the second thing.
--
-- Additive only: three nullable/defaulted columns, nothing moved.
ALTER TABLE "leads" ADD COLUMN "coldEmailOpens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "leads" ADD COLUMN "coldEmailOpenedAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "coldEmailLastOpenedAt" TIMESTAMP(3);

-- The pixel writes on every fetch and the queue reads by count. Both stay
-- cheap with an index on the leads that actually have opens.
CREATE INDEX "leads_coldEmailOpens_idx" ON "leads" ("coldEmailOpens") WHERE "coldEmailOpens" > 0;
