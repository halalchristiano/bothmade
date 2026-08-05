-- The review clock, and chasing that runs itself.
--
-- Two gaps, both of which cost money quietly.
--
-- Section 7 makes Payment 2 due on Design Approval, "including deemed
-- approval under Section 4" — five Business Days of client silence approves
-- the design. Nothing tracked that. Approval was inferred from somebody
-- moving a dropdown to Build, which means a client who simply never replied
-- left the gate closed indefinitely: the single case the contract most
-- protects the studio in was the one case the software could not see.
--
-- And an invoice that went out and was never paid sat silently. Worse, a
-- Stripe Checkout Session expires after 24 hours, so a client coming back to
-- last week's email found a dead button and no obvious way to pay.
--
-- Every column is nullable or defaulted. Nothing is backfilled: a project
-- with no design presented has a null clock, and an instalment nobody has
-- chased has a count of zero, which is exactly what they are.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "designPresentedAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "designReviewEndsAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "designApprovedAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "designApprovalDeemed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "instalments" ADD COLUMN IF NOT EXISTS "lastChasedAt" TIMESTAMP(3);
ALTER TABLE "instalments" ADD COLUMN IF NOT EXISTS "chaseCount" INTEGER NOT NULL DEFAULT 0;

-- The daily job reads "review period lapsed, still unapproved" across every
-- live project, and "invoiced, unpaid, not chased today" across every
-- instalment. Both are whole-table scans without these.
CREATE INDEX IF NOT EXISTS "projects_designReviewEndsAt_idx" ON "projects"("designReviewEndsAt");
CREATE INDEX IF NOT EXISTS "instalments_status_lastChasedAt_idx" ON "instalments"("status", "lastChasedAt");
