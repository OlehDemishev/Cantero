-- AlterTable
ALTER TABLE "drawing_sheets" ADD COLUMN     "rootSheetId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "budget_revisions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_revisions_companyId_idx" ON "budget_revisions"("companyId");

-- CreateIndex
CREATE INDEX "budget_revisions_projectId_idx" ON "budget_revisions"("projectId");

-- CreateIndex
CREATE INDEX "drawing_sheets_rootSheetId_idx" ON "drawing_sheets"("rootSheetId");

-- AddForeignKey
ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_sheets" ADD CONSTRAINT "drawing_sheets_rootSheetId_fkey" FOREIGN KEY ("rootSheetId") REFERENCES "drawing_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

