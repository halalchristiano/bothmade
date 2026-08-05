-- Change Orders — Section 9 of the contract, as a table.
--
-- A project's price was fixed at the moment it was created and nothing could
-- move it. Work agreed mid-build got billed as a separate one-off charge,
-- which left the contracted total permanently wrong: the instalment schedule
-- described a price nobody was paying, and the client's dashboard showed a
-- job costing less than they were being charged.
--
-- This is a signed document rather than an admin edit, because Section 9 says
-- "no such work begins until the Client approves the additional scope and fee
-- in writing." A form that quietly moved totalPrice would be faster and would
-- be precisely what that clause exists to prevent.
--
-- Purely additive: one new table, no column on any existing one, nothing
-- backfilled. Every project that exists today simply has no change orders.

CREATE TABLE IF NOT EXISTS "change_orders" (
  "id"        TEXT NOT NULL,
  "projectId" TEXT NOT NULL,

  -- Sequential within the project ("CO-1"), which is how anyone refers to one
  -- out loud. The unique constraint is per project, not global.
  "number"  TEXT NOT NULL,
  "summary" TEXT NOT NULL,

  -- [{ label, priceCents, kind: "add" | "remove", workStarted?, description? }]
  "items" JSONB NOT NULL DEFAULT '[]',

  -- Signed: positive adds to the Total Fee, negative reduces it.
  "deltaCents"         INTEGER NOT NULL,
  -- Both sides snapshotted. The project's price will move again; what this
  -- document said it moved from and to must not.
  "previousTotalCents" INTEGER NOT NULL,
  "newTotalCents"      INTEGER NOT NULL,

  "timelineExtensionDays" INTEGER NOT NULL DEFAULT 0,

  -- draft | sent | signed | declined | withdrawn
  "status" TEXT NOT NULL DEFAULT 'draft',

  -- Capability token for the public signing page. Same reasoning as
  -- projects.shareToken: the id in admin URLs must not be the thing that
  -- authorises agreeing to a price change.
  "token" TEXT NOT NULL DEFAULT (
    replace((gen_random_uuid())::text, '-'::text, ''::text) ||
    replace((gen_random_uuid())::text, '-'::text, ''::text)
  ),

  -- The instalment rows get rewritten on signature, so without these there is
  -- no record of what they were.
  "scheduleBefore" JSONB NOT NULL DEFAULT '[]',
  "scheduleAfter"  JSONB NOT NULL DEFAULT '[]',

  "pdfUrl" TEXT,

  "sentAt"     TIMESTAMP(3),
  "viewedAt"   TIMESTAMP(3),
  "signedAt"   TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),

  -- Clickwrap evidence: who agreed, to what, when, from where.
  "signerName"      TEXT,
  "signerEmail"     TEXT,
  "signerIp"        TEXT,
  "signerUserAgent" TEXT,
  "signedHash"      TEXT,
  "signedStatement" TEXT,
  "declineNote"     TEXT,

  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "change_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "change_orders_token_key" ON "change_orders"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "change_orders_projectId_number_key" ON "change_orders"("projectId", "number");
CREATE INDEX IF NOT EXISTS "change_orders_projectId_createdAt_idx" ON "change_orders"("projectId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_projectId_fkey') THEN
    ALTER TABLE "change_orders"
      ADD CONSTRAINT "change_orders_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- SET NULL, not CASCADE: a staff account being deleted must never take a
  -- signed amendment to a contract with it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_createdById_fkey') THEN
    ALTER TABLE "change_orders"
      ADD CONSTRAINT "change_orders_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
