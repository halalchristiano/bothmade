-- Rough target date for the current stage, set manually by the team and
-- shown to the client on their dashboard for reassurance.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "estimatedCompletionDate" TIMESTAMP(3);
