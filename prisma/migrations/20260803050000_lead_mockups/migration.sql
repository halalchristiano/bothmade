-- Every mockup sent to a lead, as its own row, so version two stops
-- overwriting version one and each version can carry the rep's notes.
CREATE TABLE "lead_mockups" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_mockups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_mockups_leadId_createdAt_idx" ON "lead_mockups"("leadId", "createdAt");

ALTER TABLE "lead_mockups" ADD CONSTRAINT "lead_mockups_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_mockups" ADD CONSTRAINT "lead_mockups_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mockups already delivered become version one, keeping the delivery date
-- they actually have. Without this the dashboard would show "no mockups yet"
-- for every lead that already has one.
INSERT INTO "lead_mockups" ("id", "leadId", "url", "createdAt", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text || "id"),
    "id",
    "mockupUrl",
    COALESCE("mockupDeliveredAt", "updatedAt"),
    COALESCE("mockupDeliveredAt", "updatedAt")
FROM "leads"
WHERE "mockupUrl" IS NOT NULL AND btrim("mockupUrl") <> '';
