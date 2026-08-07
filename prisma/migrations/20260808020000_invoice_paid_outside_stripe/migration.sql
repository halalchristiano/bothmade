-- An invoice could only ever be settled by Stripe.
--
-- The invoice email offers the alternative in as many words — "reply to this
-- email if you'd rather pay another way" — and several clients take it. There
-- was nothing on our side to record when they did. The money arrived, the
-- invoice stayed "open" forever, it kept counting toward the outstanding
-- total, and the chase queue kept surfacing a client who had already paid.
--
-- These are the "how did it arrive" for money that did not come through
-- Stripe, and who said so, for exactly the reason voidReason and refundReason
-- exist: a row that changed with no recorded reason is the hardest thing to
-- explain a year later, to a client or to an accountant, and the person who
-- could explain it is never in the room.
--
-- Null on anything Stripe settled — there the session id on the payment row
-- is the record. Both columns are additive and nullable, so every existing
-- invoice reads as "not settled by hand", which is true of all of them.
ALTER TABLE "invoices" ADD COLUMN "paidMethod" TEXT;
ALTER TABLE "invoices" ADD COLUMN "paidById" TEXT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_paidById_fkey"
  FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
