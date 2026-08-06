-- Launch, as something the system knows about.
--
-- Going live was one text box holding the finished URL. Everything the
-- contract says about the moment was untracked: "Ready for Launch" is defined
-- as the state the Agency "has confirmed in writing through the dashboard",
-- and there was no way to confirm it; Section 7 blocks launch until Payment 3
-- clears, and nothing checked; Exhibit A puts handover of credentials, source
-- and documentation in this phase, and nothing recorded it; Section 16 starts
-- a thirty-day Warranty Period at final delivery, and the launch email has
-- been telling clients it started against nothing that knew when it ended.
--
-- The domain columns are here because a launch fails on DNS more often than
-- on anything we build, and what we knew about the domain was a free-text
-- onboarding answer nobody read again.
--
-- All additive and nullable, except the checklist, which defaults to an empty
-- object. Existing projects are unaffected.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "domainName" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "domainRegistrar" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "domainAccess" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "hostingProvider" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "dnsNote" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "launchChecklist" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "readyForLaunchAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "launchedAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "warrantyEndsAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "handoverAt" TIMESTAMP(3);

-- A project that is already live has a launch date worth keeping: its last
-- update is the closest honest answer, and leaving it null would show every
-- shipped project as never launched on the new board.
UPDATE "projects" SET "launchedAt" = "updatedAt"
 WHERE "liveUrl" IS NOT NULL AND "launchedAt" IS NULL;
