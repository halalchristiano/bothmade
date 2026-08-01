-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "mockupDeliveredAt" TIMESTAMP(3),
ADD COLUMN     "mockupRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mockupRequestedAt" TIMESTAMP(3),
ADD COLUMN     "mockupUrl" TEXT;
