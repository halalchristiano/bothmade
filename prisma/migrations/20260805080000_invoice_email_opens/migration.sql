-- Did the invoice email reach a real mailbox?
--
-- The click columns next to these tell us what happened after someone opened
-- the payment page. They say nothing about the step before it: an invoice
-- sent and never clicked looks the same whether it went to spam, went to
-- somebody who has left the company, or is sitting read and ignored. The
-- first two are our problem and take a minute to fix; the third is a phone
-- call. Chasing the wrong one costs weeks.
--
-- An open pixel separates them. Not as proof anybody read it — Apple Mail
-- fetches images on delivery whether or not the human looks, and Gmail
-- proxies them — but as proof the message got past the filter into a live
-- mailbox. The absence is the stronger signal: days old, no open, no click
-- almost always means it never landed.
--
-- Two columns, both defaulted, nothing backfilled. Zero is the honest value
-- for every invoice sent before the pixel existed.

ALTER TABLE "instalments" ADD COLUMN IF NOT EXISTS "emailOpenedAt" TIMESTAMP(3);
ALTER TABLE "instalments" ADD COLUMN IF NOT EXISTS "emailOpens" INTEGER NOT NULL DEFAULT 0;
