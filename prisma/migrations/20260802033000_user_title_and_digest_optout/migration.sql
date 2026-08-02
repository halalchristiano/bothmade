-- Job title for email sign-offs, and a weekly-digest opt-out
ALTER TABLE "users" ADD COLUMN "title" TEXT;
ALTER TABLE "users" ADD COLUMN "weeklyDigestOptOut" BOOLEAN NOT NULL DEFAULT false;
