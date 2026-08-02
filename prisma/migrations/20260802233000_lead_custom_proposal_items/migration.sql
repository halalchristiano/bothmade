-- Ad-hoc line items Evan adds to a proposal beyond the fixed catalogue —
-- a name and a price he sets himself, persisted so the contract, payment
-- total, and invoice all reflect the same custom items.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "proposalCustomItems" JSONB NOT NULL DEFAULT '[]';
