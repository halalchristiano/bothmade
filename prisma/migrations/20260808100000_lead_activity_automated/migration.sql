-- Mark the timeline entries the app writes for itself, so "last worked" can skip them.
ALTER TABLE "lead_activities" ADD COLUMN "automated" BOOLEAN NOT NULL DEFAULT false;

-- Backfill the one high-volume automated writer that already has history.
-- Without this the board would sort on months of overnight cron output on the
-- day this ships, which is the exact defect the column exists to fix.
UPDATE "lead_activities"
SET "automated" = true
WHERE "content" LIKE 'Automated follow-up %'
   OR "content" LIKE 'Unsubscribed from follow-up emails.%';

CREATE INDEX "lead_activities_leadId_automated_createdAt_idx"
  ON "lead_activities" ("leadId", "automated", "createdAt");
