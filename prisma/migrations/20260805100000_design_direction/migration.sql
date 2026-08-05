-- What "good" looks like, agreed in writing before anyone designs anything.
--
-- Requirements Sign-off under Section 5 fixes WHAT gets built. Nothing fixed
-- how it should LOOK — and Section 4 excludes "subjective preferences not
-- reflected in agreed specifications" as grounds for rejecting a Deliverable.
--
-- Read together, those leave a trap. With no visual direction on record every
-- aesthetic disagreement is by definition a preference: a win on paper and a
-- loss in practice, because when the studio genuinely misread the client, the
-- contract still calls it the client's preference and still spends one of
-- their two revision rounds. The studio then either eats a round it should
-- not have charged or argues for one it cannot defend.
--
-- A signed direction closes it with machinery the agreement already has. A
-- concept that departs from the signed brief is a Section 4 non-conformance,
-- which Exhibit C makes free AND outside the allowance. A client who changes
-- their mind about the direction itself is spending a round. Same facts,
-- opposite outcomes, and now something to tell them apart by.
--
-- One row per project, created on demand. Nothing is backfilled: projects
-- that predate this have no direction on file, which is the truth about them,
-- and the project page says so rather than pretending otherwise.

CREATE TABLE IF NOT EXISTS "design_directions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "likes" JSONB NOT NULL DEFAULT '[]',
    "dislikes" JSONB NOT NULL DEFAULT '[]',
    "adjectives" JSONB NOT NULL DEFAULT '[]',
    "untouchable" TEXT,
    "hardNos" TEXT,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerEmail" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "signedHash" TEXT,
    "signedStatement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- No DB default: @updatedAt is set by Prisma on every write, and a
    -- default here shows up as schema drift against the datamodel.
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_directions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "design_directions_projectId_key"
    ON "design_directions"("projectId");

DO $$
BEGIN
    ALTER TABLE "design_directions"
        ADD CONSTRAINT "design_directions_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
