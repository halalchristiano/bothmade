-- Capability tokens for the two links handed out with no login behind them:
-- a lead's sign-and-pay page and a project's public status page. The cuid
-- primary key was doing this job before, which conflated "knows the record's
-- ID" with "is allowed to read and sign this proposal". A separate random
-- token can be rotated to revoke a link without touching the record.
--
-- The default generates 64 hex characters from two gen_random_uuid() draws
-- (Postgres seeds those from the OS CSPRNG), so rows created outside the
-- application still get an unguessable token. Application code uses
-- crypto.randomBytes(32) via lib/share-links.ts.
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "shareToken" TEXT NOT NULL
  DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "shareToken" TEXT NOT NULL
  DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

CREATE UNIQUE INDEX IF NOT EXISTS "leads_shareToken_key" ON "leads"("shareToken");
CREATE UNIQUE INDEX IF NOT EXISTS "projects_shareToken_key" ON "projects"("shareToken");

-- Password-reset tokens were held in a module-level Map. In a serverless
-- runtime that Map belongs to one instance: a reset link minted on instance
-- A is unrecognised by instance B, and every link silently dies whenever an
-- instance recycles. Persisted here instead, with a real expiry and a
-- single-use marker, and only the SHA-256 of the token is stored so a
-- database read doesn't hand over working reset links.
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "userType" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "requestedIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_email_userType_idx" ON "password_reset_tokens"("email", "userType");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");
