-- What the client says when the answer to a design is "not yet".
--
-- Approval had a button; rejection had nothing. A client who didn't like the
-- design wrote a paragraph in the message box or said it on a call, and either
-- way the studio got an undifferentiated pile of opinions with no record of
-- which of them it actually owed them.
--
-- That matters because the agreement prices the three kinds of feedback
-- completely differently. Section 4 gives two rounds of revisions for changes
-- "consistent with the originally agreed scope". Exhibit C makes a genuine
-- non-conformance free AND outside that allowance. Section 9 makes anything
-- materially different a Change Order. Nothing counted any of it, so the
-- allowance existed on paper and never in practice.
--
-- Two defaulted columns on projects and one new table. Nothing is backfilled:
-- every existing project has used no revisions as far as anyone can prove,
-- and is on round 1, which is what the defaults say.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "designRevisionsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "designRound" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "design_feedback" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "liked" TEXT,
    "note" TEXT,
    "consumedRound" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "design_feedback_projectId_createdAt_idx"
    ON "design_feedback"("projectId", "createdAt");

DO $$
BEGIN
    ALTER TABLE "design_feedback"
        ADD CONSTRAINT "design_feedback_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
