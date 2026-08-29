-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "workerSmsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "locale" "Locale",
ADD COLUMN     "safetyBriefingId" TEXT;

-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "preferredLocale" "Locale";

-- CreateIndex
CREATE INDEX "documents_safetyBriefingId_idx" ON "documents"("safetyBriefingId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_safetyBriefingId_fkey" FOREIGN KEY ("safetyBriefingId") REFERENCES "safety_briefings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

