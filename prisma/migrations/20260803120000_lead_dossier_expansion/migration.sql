-- Deliverables a rep needs to hand over on a call: the mockup as a link and
-- as a PDF, the password guarding the preview deployment, and the invoice
-- once the lead has actually been onboarded.
ALTER TABLE "leads" ADD COLUMN "mockupPdfUrl" TEXT;
ALTER TABLE "leads" ADD COLUMN "mockupPdfUploadedAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "vercelDeployPassword" TEXT;
ALTER TABLE "leads" ADD COLUMN "invoicePdfUrl" TEXT;
ALTER TABLE "leads" ADD COLUMN "invoicePdfUploadedAt" TIMESTAMP(3);

-- Who the business is. Industry and address were previously appended to
-- notes as prose, which made them unfilterable.
ALTER TABLE "leads" ADD COLUMN "industry" TEXT;
ALTER TABLE "leads" ADD COLUMN "contactRole" TEXT;
ALTER TABLE "leads" ADD COLUMN "altPhone" TEXT;
ALTER TABLE "leads" ADD COLUMN "address" TEXT;
ALTER TABLE "leads" ADD COLUMN "city" TEXT;
ALTER TABLE "leads" ADD COLUMN "region" TEXT;
ALTER TABLE "leads" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "leads" ADD COLUMN "country" TEXT;
ALTER TABLE "leads" ADD COLUMN "timezone" TEXT;

-- How big they are — used to size a suggested price for any line item that
-- has no catalogue price of its own.
ALTER TABLE "leads" ADD COLUMN "companySize" TEXT;
ALTER TABLE "leads" ADD COLUMN "employeeCount" INTEGER;
ALTER TABLE "leads" ADD COLUMN "locationCount" INTEGER;
ALTER TABLE "leads" ADD COLUMN "annualRevenueCents" INTEGER;
ALTER TABLE "leads" ADD COLUMN "yearFounded" INTEGER;

-- Public presence: the raw material for a personalised opening line.
ALTER TABLE "leads" ADD COLUMN "googleRating" DOUBLE PRECISION;
ALTER TABLE "leads" ADD COLUMN "googleReviewCount" INTEGER;
ALTER TABLE "leads" ADD COLUMN "googleMapsUrl" TEXT;
ALTER TABLE "leads" ADD COLUMN "instagramUrl" TEXT;
ALTER TABLE "leads" ADD COLUMN "facebookUrl" TEXT;
ALTER TABLE "leads" ADD COLUMN "linkedinUrl" TEXT;

-- Segmentation, suppression, and a rough ordering hint.
ALTER TABLE "leads" ADD COLUMN "tags" TEXT NOT NULL DEFAULT '';
ALTER TABLE "leads" ADD COLUMN "doNotContact" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "leads" ADD COLUMN "doNotContactReason" TEXT;
ALTER TABLE "leads" ADD COLUMN "leadScore" INTEGER;

-- When the business entered the pipeline, and when it became a client.
-- Backfilled from createdAt so existing rows report correctly rather than
-- all landing on the deploy date.
ALTER TABLE "leads" ADD COLUMN "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "leads" ADD COLUMN "clientTakenOnAt" TIMESTAMP(3);
UPDATE "leads" SET "addedAt" = "createdAt";

-- Leads that were already won predate the column, so their take-on date is
-- the best evidence we have: when the row was last touched while won.
UPDATE "leads" SET "clientTakenOnAt" = "updatedAt" WHERE "status" = 'won';

CREATE INDEX "leads_addedAt_idx" ON "leads"("addedAt");
CREATE INDEX "leads_status_addedAt_idx" ON "leads"("status", "addedAt");
CREATE INDEX "leads_assignedToId_status_idx" ON "leads"("assignedToId", "status");
CREATE INDEX "leads_clientTakenOnAt_idx" ON "leads"("clientTakenOnAt");
CREATE INDEX "leads_email_idx" ON "leads"("email");
CREATE INDEX "leads_company_idx" ON "leads"("company");
