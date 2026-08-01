-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "agreementHash" TEXT,
ADD COLUMN     "agreementIp" TEXT,
ADD COLUMN     "agreementSignedAt" TIMESTAMP(3),
ADD COLUMN     "proposalAddOns" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "proposalBaseService" TEXT,
ADD COLUMN     "proposalClientType" TEXT,
ADD COLUMN     "proposalDepositOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proposalTimeline" TEXT,
ADD COLUMN     "proposalTotalPrice" INTEGER;
