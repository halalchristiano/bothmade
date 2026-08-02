-- When someone at this business last replied. Drives the top band of the call list.
ALTER TABLE "leads" ADD COLUMN "replyReceivedAt" TIMESTAMP(3);
