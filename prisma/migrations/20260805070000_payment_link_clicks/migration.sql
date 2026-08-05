-- Did they ever click the payment link?
--
-- "Sent, never opened" and "clicked and didn't finish" are completely
-- different problems. The first is usually a wrong address or a spam folder —
-- fixable by asking who should really receive it. The second is a card that
-- failed, or somebody deciding not to yet — a phone call. From here the two
-- looked identical: an unpaid invoice and nothing else.
--
-- Two columns, both defaulted. Nothing backfilled: every existing payment has
-- never been clicked as far as anyone knows, which is what a zero says.

ALTER TABLE "instalments" ADD COLUMN IF NOT EXISTS "linkClickedAt" TIMESTAMP(3);
ALTER TABLE "instalments" ADD COLUMN IF NOT EXISTS "linkClicks" INTEGER NOT NULL DEFAULT 0;
