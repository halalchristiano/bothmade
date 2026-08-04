-- Mockups grow up.
--
-- A mockup was a URL and a note. The single most useful fact about one — did
-- the prospect actually open it — was recorded nowhere, so a rep going into a
-- call had to ask, which is both the weakest question in sales and the one
-- whose answer they most needed before dialling.
--
-- Adds the lifecycle (draft → sent → viewed → approved | changes_requested),
-- the capability token that makes a tracked link possible, view counters, an
-- expiry so a prospect who ghosted does not keep a live link to unpaid work
-- forever, and the client's own words when they respond.
--
-- Every statement is idempotent, for the same reason the team-chat migration
-- is: a half-applied migration that cannot be re-run blocks every later one.

ALTER TABLE "lead_mockups" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "lead_mockups" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
ALTER TABLE "lead_mockups" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "lead_mockups" ADD COLUMN IF NOT EXISTS "firstViewedAt" TIMESTAMP(3);
ALTER TABLE "lead_mockups" ADD COLUMN IF NOT EXISTS "lastViewedAt" TIMESTAMP(3);
ALTER TABLE "lead_mockups" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "lead_mockups" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "lead_mockups" ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMP(3);
ALTER TABLE "lead_mockups" ADD COLUMN IF NOT EXISTS "responseNote" TEXT;

-- Existing rows need a token before the column can be NOT NULL + UNIQUE.
-- gen_random_uuid() is in pgcrypto, which Supabase enables by default; the
-- md5(random()) fallback is there so this cannot fail on a plainer Postgres.
UPDATE "lead_mockups"
SET "shareToken" = COALESCE(
  NULLIF("shareToken", ''),
  md5(random()::text || clock_timestamp()::text || "id")
)
WHERE "shareToken" IS NULL OR "shareToken" = '';

ALTER TABLE "lead_mockups" ALTER COLUMN "shareToken" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "lead_mockups_shareToken_key" ON "lead_mockups"("shareToken");
CREATE INDEX IF NOT EXISTS "lead_mockups_status_sentAt_idx" ON "lead_mockups"("status", "sentAt");

-- Anything already attached was, in practice, shown to the client — the
-- column that mirrors it onto the lead is literally called mockupDeliveredAt.
-- Calling those rows 'draft' would tell a rep that work they already sent is
-- still sitting unsent.
UPDATE "lead_mockups" m
SET "status" = 'sent',
    "sentAt" = m."createdAt"
FROM "leads" l
WHERE m."leadId" = l."id"
  AND m."status" = 'draft'
  AND l."mockupDeliveredAt" IS NOT NULL;
