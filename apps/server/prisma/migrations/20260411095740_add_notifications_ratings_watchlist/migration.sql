-- CreateTable
CREATE TABLE "OptimizationProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "videoMode" TEXT NOT NULL DEFAULT 'copy_compatible',
    "videoCodec" TEXT NOT NULL DEFAULT 'h264',
    "videoCrf" INTEGER NOT NULL DEFAULT 23,
    "videoPreset" TEXT NOT NULL DEFAULT 'fast',
    "audioMode" TEXT NOT NULL DEFAULT 'reencode',
    "audioChannels" INTEGER NOT NULL DEFAULT 2,
    "audioBitrate" INTEGER NOT NULL DEFAULT 128,
    "useHwEncoder" BOOLEAN NOT NULL DEFAULT true,
    "applyToNew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OptimizationJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mediaFileId" INTEGER NOT NULL,
    "profileId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" REAL NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "error" TEXT,
    "originalSize" BIGINT,
    "optimizedSize" BIGINT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OptimizationJob_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "MediaFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OptimizationJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "OptimizationProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationEndpoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "token" TEXT,
    "chatId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "events" TEXT NOT NULL DEFAULT '["grab","complete","failed"]'
);

-- CreateTable
CREATE TABLE "UserRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "movieId" INTEGER,
    "showId" INTEGER,
    "rating" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRating_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRating_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "movieId" INTEGER,
    "showId" INTEGER,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Watchlist_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Watchlist_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Download" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" REAL NOT NULL DEFAULT 0,
    "size" BIGINT,
    "speed" REAL,
    "eta" INTEGER,
    "error" TEXT,
    "infoHash" TEXT,
    "nzbId" TEXT,
    "sourceUrl" TEXT,
    "queuePos" INTEGER NOT NULL DEFAULT 0,
    "connections" INTEGER,
    "savePath" TEXT,
    "movieId" INTEGER,
    "episodeId" INTEGER,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Download_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Download_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Download" ("addedAt", "connections", "episodeId", "error", "eta", "id", "infoHash", "movieId", "nzbId", "progress", "queuePos", "savePath", "size", "sourceUrl", "speed", "status", "title", "type", "updatedAt") SELECT "addedAt", "connections", "episodeId", "error", "eta", "id", "infoHash", "movieId", "nzbId", "progress", "queuePos", "savePath", "size", "sourceUrl", "speed", "status", "title", "type", "updatedAt" FROM "Download";
DROP TABLE "Download";
ALTER TABLE "new_Download" RENAME TO "Download";
CREATE TABLE "new_MediaFile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "movieId" INTEGER,
    "episodeId" INTEGER,
    "path" TEXT NOT NULL,
    "size" BIGINT NOT NULL DEFAULT 0,
    "codec" TEXT,
    "resolution" TEXT,
    "container" TEXT,
    "duration" REAL,
    "audioCodec" TEXT,
    "audioChannels" INTEGER,
    "videoBitrate" INTEGER,
    "audioBitrate" INTEGER,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaFile_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MediaFile_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MediaFile" ("addedAt", "codec", "container", "duration", "episodeId", "id", "movieId", "path", "resolution", "size") SELECT "addedAt", "codec", "container", "duration", "episodeId", "id", "movieId", "path", "resolution", "size" FROM "MediaFile";
DROP TABLE "MediaFile";
ALTER TABLE "new_MediaFile" RENAME TO "MediaFile";
CREATE UNIQUE INDEX "MediaFile_path_key" ON "MediaFile"("path");
CREATE TABLE "new_Movie" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tmdbId" INTEGER NOT NULL,
    "imdbId" TEXT,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "overview" TEXT,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "genres" TEXT NOT NULL DEFAULT '[]',
    "runtime" INTEGER,
    "rating" REAL,
    "status" TEXT NOT NULL DEFAULT 'wanted',
    "monitored" BOOLEAN NOT NULL DEFAULT true,
    "qualityProfileId" INTEGER,
    "optimizationProfileId" INTEGER,
    "added" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Movie_qualityProfileId_fkey" FOREIGN KEY ("qualityProfileId") REFERENCES "QualityProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movie_optimizationProfileId_fkey" FOREIGN KEY ("optimizationProfileId") REFERENCES "OptimizationProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Movie" ("added", "backdropPath", "genres", "id", "imdbId", "monitored", "overview", "posterPath", "qualityProfileId", "rating", "runtime", "status", "title", "tmdbId", "year") SELECT "added", "backdropPath", "genres", "id", "imdbId", "monitored", "overview", "posterPath", "qualityProfileId", "rating", "runtime", "status", "title", "tmdbId", "year" FROM "Movie";
DROP TABLE "Movie";
ALTER TABLE "new_Movie" RENAME TO "Movie";
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");
CREATE TABLE "new_Show" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tmdbId" INTEGER NOT NULL,
    "tvdbId" INTEGER,
    "title" TEXT NOT NULL,
    "overview" TEXT,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "genres" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'wanted',
    "monitored" BOOLEAN NOT NULL DEFAULT true,
    "qualityProfileId" INTEGER,
    "optimizationProfileId" INTEGER,
    "added" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Show_qualityProfileId_fkey" FOREIGN KEY ("qualityProfileId") REFERENCES "QualityProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Show_optimizationProfileId_fkey" FOREIGN KEY ("optimizationProfileId") REFERENCES "OptimizationProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Show" ("added", "backdropPath", "genres", "id", "monitored", "overview", "posterPath", "qualityProfileId", "status", "title", "tmdbId", "tvdbId") SELECT "added", "backdropPath", "genres", "id", "monitored", "overview", "posterPath", "qualityProfileId", "status", "title", "tmdbId", "tvdbId" FROM "Show";
DROP TABLE "Show";
ALTER TABLE "new_Show" RENAME TO "Show";
CREATE UNIQUE INDEX "Show_tmdbId_key" ON "Show"("tmdbId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OptimizationProfile_name_key" ON "OptimizationProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserRating_userId_movieId_key" ON "UserRating"("userId", "movieId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRating_userId_showId_key" ON "UserRating"("userId", "showId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_movieId_key" ON "Watchlist"("userId", "movieId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_showId_key" ON "Watchlist"("userId", "showId");
