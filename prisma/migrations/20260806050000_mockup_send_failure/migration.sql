-- A mockup whose email failed still read "Sent today, not opened yet".
--
-- The row is stamped as sent before the send, deliberately: the tracked link
-- 404s while the row is still a draft, so a link that goes out against an
-- unstamped row is a link the client cannot open. When the send then failed,
-- nothing recorded that — the honest error lived in the response and was gone
-- on the next reload, and the pipeline showed delivered work that had been
-- delivered to nobody.
--
-- Additive only: two nullable columns, nothing moved, every existing row
-- keeps exactly what it had and reads as it did before.
ALTER TABLE "lead_mockups" ADD COLUMN "sendFailedAt" TIMESTAMP(3);
ALTER TABLE "lead_mockups" ADD COLUMN "sendFailedReason" TEXT;
