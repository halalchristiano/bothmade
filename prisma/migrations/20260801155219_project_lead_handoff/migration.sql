-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "convertedFromLeadId" TEXT,
ADD COLUMN     "handoffAcknowledgedAt" TIMESTAMP(3);
