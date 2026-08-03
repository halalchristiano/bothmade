-- Addresses we may never email again: unsubscribes, spam complaints, hard
-- bounces, and manual blocks. Checked immediately before every send.
CREATE TABLE IF NOT EXISTS "email_suppressions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_suppressions_email_key" ON "email_suppressions"("email");
