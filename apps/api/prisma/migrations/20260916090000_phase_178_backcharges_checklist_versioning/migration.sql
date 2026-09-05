-- CreateEnum
CREATE TYPE "SubcontractorBackchargeStatus" AS ENUM ('pending', 'deducted', 'waived');

-- CreateEnum
CREATE TYPE "SubcontractorDefaultNoticeStatus" AS ENUM ('issued', 'cured', 'terminated');

-- AlterTable
ALTER TABLE "checklist_templates" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "previousVersionId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "subcontractor_backcharges" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "punchListItemId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "SubcontractorBackchargeStatus" NOT NULL DEFAULT 'pending',
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "subcontractor_backcharges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_default_notices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "noticeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "curePeriodDays" INTEGER,
    "cureDeadline" TIMESTAMP(3),
    "status" "SubcontractorDefaultNoticeStatus" NOT NULL DEFAULT 'issued',
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "subcontractor_default_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subcontractor_backcharges_companyId_idx" ON "subcontractor_backcharges"("companyId");

-- CreateIndex
CREATE INDEX "subcontractor_backcharges_projectId_idx" ON "subcontractor_backcharges"("projectId");

-- CreateIndex
CREATE INDEX "subcontractor_backcharges_subcontractorId_idx" ON "subcontractor_backcharges"("subcontractorId");

-- CreateIndex
CREATE INDEX "subcontractor_default_notices_companyId_idx" ON "subcontractor_default_notices"("companyId");

-- CreateIndex
CREATE INDEX "subcontractor_default_notices_projectId_idx" ON "subcontractor_default_notices"("projectId");

-- CreateIndex
CREATE INDEX "subcontractor_default_notices_subcontractorId_idx" ON "subcontractor_default_notices"("subcontractorId");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_previousVersionId_key" ON "checklist_templates"("previousVersionId");

-- AddForeignKey
ALTER TABLE "subcontractor_backcharges" ADD CONSTRAINT "subcontractor_backcharges_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_backcharges" ADD CONSTRAINT "subcontractor_backcharges_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_backcharges" ADD CONSTRAINT "subcontractor_backcharges_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_backcharges" ADD CONSTRAINT "subcontractor_backcharges_punchListItemId_fkey" FOREIGN KEY ("punchListItemId") REFERENCES "punch_list_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_default_notices" ADD CONSTRAINT "subcontractor_default_notices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_default_notices" ADD CONSTRAINT "subcontractor_default_notices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_default_notices" ADD CONSTRAINT "subcontractor_default_notices_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

