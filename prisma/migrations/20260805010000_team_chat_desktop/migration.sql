-- Team chat grows up: a kind discriminator so the app's own narration (a
-- payment landing, a mockup delivered) stops rendering as words a real
-- person never wrote, attachments as native Json like every newer column,
-- and the indexes the unread predicate and notification bell have been
-- table-scanning without.
--
-- Additive only: existing rows become kind='chat' with no attachments,
-- which is exactly what they were.
--
-- Every statement is idempotent, and that is deliberate rather than
-- decorative. The first production run of this migration failed and left a
-- failed row in `_prisma_migrations`, which blocks every later migration
-- (P3009) until it is cleared. Clearing it makes Prisma re-run this file —
-- and because a failed migration rolls back under Postgres's transactional
-- DDL, it should re-run against an untouched table. "Should" is doing a lot
-- of work in that sentence, so the SQL no longer leans on it: this applies
-- cleanly whether the columns and indexes are absent, present, or
-- half-present.

ALTER TABLE "team_messages" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE "team_messages" ADD COLUMN IF NOT EXISTS "attachments" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "team_messages_createdAt_idx" ON "team_messages"("createdAt");
CREATE INDEX IF NOT EXISTS "team_messages_toUserId_createdAt_idx" ON "team_messages"("toUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "team_messages_relatedLeadId_urgent_resolved_idx" ON "team_messages"("relatedLeadId", "urgent", "resolved");
