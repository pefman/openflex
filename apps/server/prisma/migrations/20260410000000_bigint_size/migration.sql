-- AlterTable: Download.size Int? -> BigInt?
-- SQLite stores integers natively as up to 8-byte signed integers; the column
-- type hint is for Prisma's type layer only, so a simple PRAGMA-free rename
-- approach is used via a new table.
CREATE TABLE "_Download_new" (
  "id"        INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "type"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'queued',
  "progress"  REAL NOT NULL DEFAULT 0,
  "size"      BIGINT,
  "speed"     REAL,
  "eta"       INTEGER,
  "error"     TEXT,
  "infoHash"  TEXT,
  "nzbId"     TEXT,
  "savePath"  TEXT,
  "movieId"   INTEGER,
  "episodeId" INTEGER,
  "addedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
INSERT INTO "_Download_new" SELECT "id","type","title","status","progress","size","speed","eta","error","infoHash","nzbId","savePath","movieId","episodeId","addedAt","updatedAt" FROM "Download";
DROP TABLE "Download";
ALTER TABLE "_Download_new" RENAME TO "Download";

-- AlterTable: MediaFile.size Int -> BigInt
CREATE TABLE "_MediaFile_new" (
  "id"         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "movieId"    INTEGER,
  "episodeId"  INTEGER,
  "path"       TEXT NOT NULL,
  "size"       BIGINT NOT NULL DEFAULT 0,
  "codec"      TEXT,
  "resolution" TEXT,
  "container"  TEXT,
  "duration"   REAL,
  "addedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "_MediaFile_new" SELECT "id","movieId","episodeId","path","size","codec","resolution","container","duration","addedAt" FROM "MediaFile";
DROP TABLE "MediaFile";
ALTER TABLE "_MediaFile_new" RENAME TO "MediaFile";
CREATE UNIQUE INDEX "MediaFile_path_key" ON "MediaFile"("path");
