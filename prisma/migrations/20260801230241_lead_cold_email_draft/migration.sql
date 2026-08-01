-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "coldEmailDraft" TEXT,
ADD COLUMN     "coldEmailSentAt" TIMESTAMP(3);
