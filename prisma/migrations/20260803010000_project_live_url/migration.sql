-- The deployed/shipped product's live URL, set once by the team when the
-- project is actually done — powers the "your project is live" delivery
-- moment on the client dashboard.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "liveUrl" TEXT;
