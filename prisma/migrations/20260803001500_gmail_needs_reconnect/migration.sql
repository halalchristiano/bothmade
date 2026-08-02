-- Whether this mailbox needs re-authorising for read access. A token minted
-- before reading was required can still send, so nothing looks broken while
-- bounce and reply detection sit silently dead.
ALTER TABLE "users" ADD COLUMN "gmailNeedsReconnect" BOOLEAN NOT NULL DEFAULT false;
