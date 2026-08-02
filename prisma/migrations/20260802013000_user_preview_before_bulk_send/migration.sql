-- Toggle for previewing bulk cold-email sends before they go out (defaults on)
ALTER TABLE "users" ADD COLUMN "previewBeforeBulkSend" BOOLEAN NOT NULL DEFAULT true;
