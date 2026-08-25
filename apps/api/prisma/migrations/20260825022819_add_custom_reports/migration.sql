-- CreateEnum
CREATE TYPE "ReportDataset" AS ENUM ('projects', 'invoices', 'estimates', 'time_entries', 'punch_list', 'rfis');

-- CreateTable
CREATE TABLE "custom_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataset" "ReportDataset" NOT NULL,
    "columns" TEXT[],
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "statusEquals" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_reports_companyId_idx" ON "custom_reports"("companyId");

-- AddForeignKey
ALTER TABLE "custom_reports" ADD CONSTRAINT "custom_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_reports" ADD CONSTRAINT "custom_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

