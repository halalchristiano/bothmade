-- A permanent receipt of every CSV lead import
CREATE TABLE "csv_import_logs" (
    "id" TEXT NOT NULL,
    "fileName" TEXT,
    "rowCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csv_import_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "csv_import_logs" ADD CONSTRAINT "csv_import_logs_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
