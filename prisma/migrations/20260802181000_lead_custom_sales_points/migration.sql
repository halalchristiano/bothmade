-- Per-lead, hand-written sales content from the research CSV, plus the
-- quotable estimate range. Points are stored one "Point: explanation" per
-- line rather than as numbered columns, since the count varies per lead.
ALTER TABLE "leads" ADD COLUMN "customPainPoints" TEXT;
ALTER TABLE "leads" ADD COLUMN "essentialPoints" TEXT;
ALTER TABLE "leads" ADD COLUMN "upsellPoints" TEXT;
ALTER TABLE "leads" ADD COLUMN "estimateLowCents" INTEGER;
ALTER TABLE "leads" ADD COLUMN "estimateHighCents" INTEGER;
