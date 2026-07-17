-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceNumber" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "poNumber" TEXT,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "hasException" BOOLEAN NOT NULL DEFAULT false,
    "exceptionFlags" TEXT NOT NULL DEFAULT '[]',
    "aiRecommendation" TEXT,
    "aiRationale" TEXT,
    "aiConfidence" REAL,
    "aiModel" TEXT,
    "aiSource" TEXT,
    "aiRaw" TEXT,
    "humanOverride" TEXT,
    "overrideNote" TEXT,
    "resolvedById" INTEGER,
    "resolvedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Invoice" ("aiConfidence", "aiModel", "aiRationale", "aiRaw", "aiRecommendation", "aiSource", "amount", "createdAt", "exceptionFlags", "hasException", "humanOverride", "id", "invoiceNumber", "overrideNote", "poNumber", "resolvedAt", "resolvedById", "source", "status", "vendorName") SELECT "aiConfidence", "aiModel", "aiRationale", "aiRaw", "aiRecommendation", "aiSource", "amount", "createdAt", "exceptionFlags", "hasException", "humanOverride", "id", "invoiceNumber", "overrideNote", "poNumber", "resolvedAt", "resolvedById", "source", "status", "vendorName" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
