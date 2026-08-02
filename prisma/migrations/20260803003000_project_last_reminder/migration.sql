-- Tracks the last time a payment reminder was sent for a project's balance,
-- so the dashboard can show "reminded Xh ago" instead of forgetting on reload.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "lastPaymentReminderSentAt" TIMESTAMP(3);
