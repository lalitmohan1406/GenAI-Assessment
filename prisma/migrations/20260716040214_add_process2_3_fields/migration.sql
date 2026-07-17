-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vendor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abn" TEXT,
    "bankAccount" TEXT,
    "category" TEXT,
    "screeningFlags" TEXT NOT NULL DEFAULT '[]',
    "riskTier" TEXT,
    "screeningNotes" TEXT,
    "aiRecommendation" TEXT,
    "aiConfidence" REAL,
    "aiModel" TEXT,
    "aiSource" TEXT,
    "aiRaw" TEXT,
    "screenedAt" DATETIME,
    "onboardingStatus" TEXT NOT NULL DEFAULT 'approved',
    "decisionById" INTEGER,
    "decisionNote" TEXT,
    "decisionAt" DATETIME
);
INSERT INTO "new_Vendor" ("createdAt", "id", "name") SELECT "createdAt", "id", "name" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
