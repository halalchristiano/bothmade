-- Carries a lead's custom proposal items through to the project it becomes,
-- so onboarding reflects the full scope the client actually paid for.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "customItems" JSONB NOT NULL DEFAULT '[]';
