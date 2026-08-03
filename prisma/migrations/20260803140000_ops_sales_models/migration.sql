-- Models the ops and sales dashboards needed before "overdue", "unread",
-- and "won this month" could mean anything precise.

-- Per-user read state for team messages. A single readAt on the message
-- cannot represent "Evan has read this broadcast and Kiana hasn't" — the
-- first reader cleared the badge for everybody.
CREATE TABLE IF NOT EXISTS "team_message_reads" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_message_reads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_message_reads_messageId_userId_key" ON "team_message_reads"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "team_message_reads_userId_idx" ON "team_message_reads"("userId");

-- What a team message is, so delivering a mockup resolves the mockup
-- request rather than every open question on the lead.
ALTER TABLE "team_messages" ADD COLUMN IF NOT EXISTS "kind" TEXT;
CREATE INDEX IF NOT EXISTS "team_messages_toUserId_resolved_idx" ON "team_messages"("toUserId", "resolved");

-- Backfill: existing urgent flags that came from the mockup-request action
-- are identifiable by their content prefix and nothing else.
UPDATE "team_messages" SET "kind" = 'mockup_request'
 WHERE "kind" IS NULL AND "urgent" = true AND "content" LIKE '🎨 Mockup requested%';

-- Carry the legacy single readAt forward as that message's sender-side
-- read row where we can attribute it: a direct message's readAt belongs to
-- its recipient. Broadcasts are left unread for everyone, which is the
-- honest starting state.
INSERT INTO "team_message_reads" ("id", "messageId", "userId", "readAt")
SELECT md5(random()::text || clock_timestamp()::text), "id", "toUserId", "readAt"
  FROM "team_messages"
 WHERE "readAt" IS NOT NULL AND "toUserId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Dismissible, snoozeable notifications.
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'normal',
    "subjectType" TEXT,
    "subjectId" TEXT,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_userId_kind_subjectType_subjectId_key" ON "notifications"("userId", "kind", "subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "notifications_userId_dismissedAt_idx" ON "notifications"("userId", "dismissedAt");

-- Password reset tokens that survive a cold start. Only the hash is kept.
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_email_idx" ON "password_reset_tokens"("email");

-- Deliverables as rows, not a JSON blob rewritten in full on every change.
CREATE TABLE IF NOT EXISTS "deliverables" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "deliverables_projectId_idx" ON "deliverables"("projectId");

-- Backfill every file out of the old JSON array. jsonb_array_elements over
-- a text column that may hold '', NULL, or malformed JSON, so it is guarded.
INSERT INTO "deliverables" ("id", "projectId", "name", "url", "size", "createdAt")
SELECT
    COALESCE(elem->>'id', md5(random()::text || clock_timestamp()::text)),
    p."id",
    COALESCE(elem->>'name', 'Untitled'),
    elem->>'url',
    elem->>'size',
    COALESCE((elem->>'addedAt')::timestamp, CURRENT_TIMESTAMP)
  FROM "projects" p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN p."deliverables" IS NULL OR p."deliverables" = '' THEN '[]'::jsonb
         ELSE p."deliverables"::jsonb END
  ) AS elem
 WHERE elem->>'url' IS NOT NULL
ON CONFLICT DO NOTHING;

-- Real due dates, so "overdue" is a date in the past rather than a guess.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "balanceDueAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "projects_invoiceNumber_key" ON "projects"("invoiceNumber");

CREATE TABLE IF NOT EXISTS "milestones" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'build',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "wasLate" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "milestones_projectId_dueAt_idx" ON "milestones"("projectId", "dueAt");

-- When a deal was actually won, and whether its phone number is usable.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "wonAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phoneInvalid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phoneInvalidAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phoneInvalidReason" TEXT;

-- Best available backfill for historical wins: updatedAt is what the
-- reports were already (wrongly) using, so this changes no existing number
-- while making every future one correct.
UPDATE "leads" SET "wonAt" = "updatedAt" WHERE "status" = 'won' AND "wonAt" IS NULL;

-- Foreign keys last, so the backfills above can't fail on ordering.
ALTER TABLE "team_message_reads" DROP CONSTRAINT IF EXISTS "team_message_reads_messageId_fkey";
ALTER TABLE "team_message_reads" ADD CONSTRAINT "team_message_reads_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "team_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_message_reads" DROP CONSTRAINT IF EXISTS "team_message_reads_userId_fkey";
ALTER TABLE "team_message_reads" ADD CONSTRAINT "team_message_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_userId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deliverables" DROP CONSTRAINT IF EXISTS "deliverables_projectId_fkey";
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "milestones" DROP CONSTRAINT IF EXISTS "milestones_projectId_fkey";
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
