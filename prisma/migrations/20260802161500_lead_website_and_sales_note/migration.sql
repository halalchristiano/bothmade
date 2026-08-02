-- Dedicated existing-website link and a strategic sales note, separate from general notes
ALTER TABLE "leads" ADD COLUMN "originalWebsite" TEXT;
ALTER TABLE "leads" ADD COLUMN "salesNote" TEXT;
