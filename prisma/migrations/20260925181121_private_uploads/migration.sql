-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "extractedText" TEXT;

-- CreateTable
CREATE TABLE "PendingUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "extractedText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingUpload_storagePath_key" ON "PendingUpload"("storagePath");

-- CreateIndex
CREATE INDEX "PendingUpload_userId_createdAt_idx" ON "PendingUpload"("userId", "createdAt");
