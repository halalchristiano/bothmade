-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "qualAuthority" TEXT,
ADD COLUMN     "qualBudget" TEXT,
ADD COLUMN     "qualMotivation" TEXT,
ADD COLUMN     "qualNeed" TEXT,
ADD COLUMN     "qualTiming" TEXT,
ADD COLUMN     "qualifiedAt" TIMESTAMP(3);
