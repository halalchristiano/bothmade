-- Team chat grows up: a kind discriminator so the app's own narration (a
-- payment landing, a mockup delivered) stops rendering as words a real
-- person never wrote, attachments as native Json like every newer column,
-- and the indexes the unread predicate and notification bell have been
-- table-scanning without.
--
-- Additive only: existing rows become kind='chat' with no attachments,
-- which is exactly what they were.

ALTER TABLE "team_messages" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE "team_messages" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "team_messages_createdAt_idx" ON "team_messages"("createdAt");
CREATE INDEX "team_messages_toUserId_createdAt_idx" ON "team_messages"("toUserId", "createdAt");
CREATE INDEX "team_messages_relatedLeadId_urgent_resolved_idx" ON "team_messages"("relatedLeadId", "urgent", "resolved");
