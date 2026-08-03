-- Shared rate-limit counters. Per-instance counters are meaningless on
-- serverless, where a cold start hands the caller a fresh budget.
CREATE TABLE IF NOT EXISTS "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- Supports the periodic sweep of lapsed windows.
CREATE INDEX IF NOT EXISTS "rate_limits_windowStart_idx" ON "rate_limits"("windowStart");
