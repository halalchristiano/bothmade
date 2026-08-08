-- Who put a lead in the system, which is a different question from who owns
-- it now. The open alert is addressed to the person who uploaded the batch:
-- they sent the emails and they are the one waiting to hear back, and a
-- reassignment afterwards should not redirect that.
ALTER TABLE "leads" ADD COLUMN "importedById" TEXT;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_importedById_fkey"
  FOREIGN KEY ("importedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Nullable and deliberately not backfilled. Every existing lead predates the
-- column, and the honest value for "who imported this" on a row nobody
-- recorded it for is nothing — guessing it from assignedToId would invent a
-- fact and then be indistinguishable from a real one. Those leads fall back
-- to the assignee, which is what they already did.
CREATE INDEX "leads_importedById_idx" ON "leads" ("importedById");
