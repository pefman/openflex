-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Movie" (
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
    "added" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Movie_qualityProfileId_fkey" FOREIGN KEY ("qualityProfileId") REFERENCES "QualityProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Show" (
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
    "added" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Show_qualityProfileId_fkey" FOREIGN KEY ("qualityProfileId") REFERENCES "QualityProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Season" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "showId" INTEGER NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "episodeCount" INTEGER NOT NULL DEFAULT 0,
    "posterPath" TEXT,
    CONSTRAINT "Season_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "showId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT,
    "overview" TEXT,
    "airDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'wanted',
    "monitored" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Episode_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Episode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "movieId" INTEGER,
    "episodeId" INTEGER,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "codec" TEXT,
    "resolution" TEXT,
    "container" TEXT,
    "duration" REAL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaFile_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MediaFile_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Download" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" REAL NOT NULL DEFAULT 0,
    "size" INTEGER,
    "speed" REAL,
    "eta" INTEGER,
    "error" TEXT,
    "infoHash" TEXT,
    "nzbId" TEXT,
    "savePath" TEXT,
    "movieId" INTEGER,
    "episodeId" INTEGER,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Download_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Download_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "items" TEXT NOT NULL DEFAULT '[]',
    "upgradeAllowed" BOOLEAN NOT NULL DEFAULT true,
    "minScore" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Indexer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "UsenetServer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 563,
    "ssl" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "maxConnections" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PlaybackPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "mediaFileId" INTEGER NOT NULL,
    "position" REAL NOT NULL DEFAULT 0,
    "duration" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlaybackPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaybackPosition_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "MediaFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "Show_tmdbId_key" ON "Show"("tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_showId_seasonNumber_key" ON "Season"("showId", "seasonNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_showId_seasonId_episodeNumber_key" ON "Episode"("showId", "seasonId", "episodeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFile_path_key" ON "MediaFile"("path");

-- CreateIndex
CREATE UNIQUE INDEX "QualityProfile_name_key" ON "QualityProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybackPosition_userId_mediaFileId_key" ON "PlaybackPosition"("userId", "mediaFileId");
