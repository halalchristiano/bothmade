-- When a client last opened a project's dashboard. "New since your last
-- visit" was localStorage, so it was per-browser: read on the laptop, still
-- flagged new on the phone, and clearing site data lit up months of history.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "clientLastViewedAt" TIMESTAMP(3);

-- Prices the team can change without a deploy. The catalogue in
-- lib/pricing.ts still defines what each item is; this only overrides cost.
CREATE TABLE IF NOT EXISTS "pricing_overrides" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pricing_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_overrides_key_key" ON "pricing_overrides"("key");
ALTER TABLE "pricing_overrides" DROP CONSTRAINT IF EXISTS "pricing_overrides_updatedById_fkey";
ALTER TABLE "pricing_overrides" ADD CONSTRAINT "pricing_overrides_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
