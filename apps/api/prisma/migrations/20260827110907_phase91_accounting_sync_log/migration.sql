-- CreateEnum
CREATE TYPE "AccountingSyncStatus" AS ENUM ('success', 'failed');

-- CreateTable
CREATE TABLE "accounting_sync_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "AccountingSyncStatus" NOT NULL,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_sync_logs_companyId_idx" ON "accounting_sync_logs"("companyId");

-- CreateIndex
CREATE INDEX "accounting_sync_logs_companyId_status_idx" ON "accounting_sync_logs"("companyId", "status");

-- AddForeignKey
ALTER TABLE "accounting_sync_logs" ADD CONSTRAINT "accounting_sync_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
