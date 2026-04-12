-- CreateTable
CREATE TABLE "ImdbListSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'imdb',
    "externalListId" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "importTarget" TEXT NOT NULL DEFAULT 'library',
    "contentTypes" TEXT NOT NULL DEFAULT '["movie","show"]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "syncIntervalHours" INTEGER NOT NULL DEFAULT 6,
    "lastSyncedAt" DATETIME,
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ImdbListSubscription_userId_source_externalListId_key" ON "ImdbListSubscription"("userId", "source", "externalListId");

-- CreateIndex
CREATE INDEX "ImdbListSubscription_enabled_lastSyncedAt_idx" ON "ImdbListSubscription"("enabled", "lastSyncedAt");
