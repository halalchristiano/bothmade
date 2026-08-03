-- Session revocation watermark.
--
-- Sessions are stateless 7-day JWTs with no server-side store, so changing a
-- password did nothing to a token that had already been stolen — the holder
-- kept access for the remainder of the week. Each account now carries the
-- instant from which sessions are considered valid; any token minted before
-- it is refused for the rest of its life.
--
-- Nullable with no default on purpose: NULL means "nothing has ever been
-- revoked for this account", which is the correct state for every existing
-- row. Backfilling a timestamp here would sign out every current session on
-- deploy.
ALTER TABLE "users" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
ALTER TABLE "clients" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
