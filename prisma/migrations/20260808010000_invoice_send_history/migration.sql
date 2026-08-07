-- An invoice could be raised and then never sent again.
--
-- Three different situations produced an invoice sitting in the ledger that
-- the client had never actually received: the raise was made with "email the
-- client" switched off, the send failed and was reported as a warning nobody
-- could act on, or the client simply lost it. The only actions on the row
-- were Cancel and Refund, so the answer to "they say they never got it" was
-- to cancel a perfectly good invoice and raise it again under a new number.
--
-- `sentToEmail` records where a copy went and nothing about when or how
-- often, so an invoice raised for the record only, one whose send failed, and
-- one the client has been chased about three times all read the same. These
-- separate them — and stop a fourth reminder going out this morning because
-- nobody could tell there had been three.
--
-- Both additive with defaults. Every existing invoice reads as "never chased",
-- which is true: until now there was no way to.
ALTER TABLE "invoices" ADD COLUMN "lastSentAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "sendCount" INTEGER NOT NULL DEFAULT 0;
