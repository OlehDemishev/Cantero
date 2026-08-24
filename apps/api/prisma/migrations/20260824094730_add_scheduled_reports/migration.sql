-- CreateEnum
CREATE TYPE "ScheduledReportType" AS ENUM ('overview', 'project_margins', 'warehouse_turnover', 'invoice_aging', 'portfolio', 'cash_flow_forecast');

-- CreateEnum
CREATE TYPE "ScheduledReportFrequency" AS ENUM ('weekly', 'monthly');

-- CreateTable
CREATE TABLE "scheduled_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" "ScheduledReportType" NOT NULL,
    "frequency" "ScheduledReportFrequency" NOT NULL,
    "recipientEmails" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_reports_companyId_idx" ON "scheduled_reports"("companyId");

-- CreateIndex
CREATE INDEX "scheduled_reports_active_nextRunAt_idx" ON "scheduled_reports"("active", "nextRunAt");

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
