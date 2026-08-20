-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "dailyLogId" TEXT,
ADD COLUMN     "incidentReportId" TEXT,
ADD COLUMN     "punchListItemId" TEXT,
ADD COLUMN     "warrantyClaimId" TEXT;

-- CreateIndex
CREATE INDEX "documents_punchListItemId_idx" ON "documents"("punchListItemId");

-- CreateIndex
CREATE INDEX "documents_dailyLogId_idx" ON "documents"("dailyLogId");

-- CreateIndex
CREATE INDEX "documents_incidentReportId_idx" ON "documents"("incidentReportId");

-- CreateIndex
CREATE INDEX "documents_warrantyClaimId_idx" ON "documents"("warrantyClaimId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_punchListItemId_fkey" FOREIGN KEY ("punchListItemId") REFERENCES "punch_list_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "daily_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_incidentReportId_fkey" FOREIGN KEY ("incidentReportId") REFERENCES "incident_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_warrantyClaimId_fkey" FOREIGN KEY ("warrantyClaimId") REFERENCES "warranty_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
