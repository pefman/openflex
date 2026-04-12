-- AlterTable: Download — add sourceUrl and queuePos for queue management
ALTER TABLE "Download" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "Download" ADD COLUMN "queuePos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Download" ADD COLUMN "connections" INTEGER;
