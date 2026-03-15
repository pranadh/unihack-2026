-- AlterTable
ALTER TABLE "SongRequest"
ADD COLUMN "guestSessionHash" TEXT;

-- CreateIndex
CREATE INDEX "SongRequest_guestSessionHash_createdAt_idx"
ON "SongRequest"("guestSessionHash", "createdAt");
