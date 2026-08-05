-- The link we send and the link we navigate to were one column, so the lead
-- page offered a password-protected Vercel preview as "the mockup we sent".
-- Additive only: nothing moves, and every existing row keeps whatever it had.
ALTER TABLE "leads" ADD COLUMN "mockupFolderUrl" TEXT;
