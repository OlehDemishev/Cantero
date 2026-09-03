-- CreateEnum
CREATE TYPE "BallInCourtParty" AS ENUM ('internal', 'client', 'subcontractor');

-- AlterTable
ALTER TABLE "accounting_sync_logs" ADD COLUMN     "subcontractorCostId" TEXT,
ADD COLUMN     "subcontractorCostReference" TEXT,
ALTER COLUMN "invoiceId" DROP NOT NULL,
ALTER COLUMN "invoiceNumber" DROP NOT NULL;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "preferredLocale" "Locale";

-- AlterTable
ALTER TABLE "rfis" ADD COLUMN     "ballInCourtParty" "BallInCourtParty" NOT NULL DEFAULT 'internal';

-- AlterTable
ALTER TABLE "subcontractor_costs" ADD COLUMN     "externalAccountingId" TEXT,
ADD COLUMN     "externalAccountingSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "offboarding_template_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "offboarding_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_offboarding_tasks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_offboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offboarding_template_items_companyId_idx" ON "offboarding_template_items"("companyId");

-- CreateIndex
CREATE INDEX "worker_offboarding_tasks_companyId_idx" ON "worker_offboarding_tasks"("companyId");

-- CreateIndex
CREATE INDEX "worker_offboarding_tasks_workerId_idx" ON "worker_offboarding_tasks"("workerId");

-- AddForeignKey
ALTER TABLE "offboarding_template_items" ADD CONSTRAINT "offboarding_template_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_offboarding_tasks" ADD CONSTRAINT "worker_offboarding_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_offboarding_tasks" ADD CONSTRAINT "worker_offboarding_tasks_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

