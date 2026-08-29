-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "contractNumber" TEXT,
ADD COLUMN     "isPublicWork" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "wageClassificationId" TEXT;

-- CreateTable
CREATE TABLE "wage_classifications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "fringeRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wage_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certified_payroll_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weekEndingDate" TIMESTAMP(3) NOT NULL,
    "payrollNumber" INTEGER NOT NULL,
    "noWorkPerformed" BOOLEAN NOT NULL DEFAULT false,
    "lineItems" JSONB,
    "totalGrossPay" DECIMAL(12,2),
    "statementSignerName" TEXT,
    "statementSignedAt" TIMESTAMP(3),
    "pdfStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "certified_payroll_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wage_classifications_companyId_idx" ON "wage_classifications"("companyId");

-- CreateIndex
CREATE INDEX "certified_payroll_reports_companyId_idx" ON "certified_payroll_reports"("companyId");

-- CreateIndex
CREATE INDEX "certified_payroll_reports_projectId_idx" ON "certified_payroll_reports"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "certified_payroll_reports_projectId_weekEndingDate_key" ON "certified_payroll_reports"("projectId", "weekEndingDate");

-- AddForeignKey
ALTER TABLE "wage_classifications" ADD CONSTRAINT "wage_classifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certified_payroll_reports" ADD CONSTRAINT "certified_payroll_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certified_payroll_reports" ADD CONSTRAINT "certified_payroll_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_wageClassificationId_fkey" FOREIGN KEY ("wageClassificationId") REFERENCES "wage_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

