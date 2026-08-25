-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "ptoAccrualHoursPerMonth" DECIMAL(6,2),
ADD COLUMN     "reportingCurrency" "Currency";

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "coverLetter" TEXT;

-- AlterTable
ALTER TABLE "workers" ADD COLUMN     "ptoBalanceHours" DECIMAL(8,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "fromCurrency" "Currency" NOT NULL,
    "toCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(14,6) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assemblies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assemblies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_items" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "rateCatalogItemId" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "assembly_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "matchedInvoiceId" TEXT,
    "matchedExpenseId" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "onboarding_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_onboarding_tasks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_fromCurrency_toCurrency_key" ON "exchange_rates"("fromCurrency", "toCurrency");

-- CreateIndex
CREATE INDEX "assemblies_companyId_idx" ON "assemblies"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "assemblies_companyId_code_key" ON "assemblies"("companyId", "code");

-- CreateIndex
CREATE INDEX "assembly_items_assemblyId_idx" ON "assembly_items"("assemblyId");

-- CreateIndex
CREATE INDEX "bank_transactions_companyId_idx" ON "bank_transactions"("companyId");

-- CreateIndex
CREATE INDEX "onboarding_template_items_companyId_idx" ON "onboarding_template_items"("companyId");

-- CreateIndex
CREATE INDEX "worker_onboarding_tasks_companyId_idx" ON "worker_onboarding_tasks"("companyId");

-- CreateIndex
CREATE INDEX "worker_onboarding_tasks_workerId_idx" ON "worker_onboarding_tasks"("workerId");

-- AddForeignKey
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_items" ADD CONSTRAINT "assembly_items_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_items" ADD CONSTRAINT "assembly_items_rateCatalogItemId_fkey" FOREIGN KEY ("rateCatalogItemId") REFERENCES "rate_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matchedInvoiceId_fkey" FOREIGN KEY ("matchedInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matchedExpenseId_fkey" FOREIGN KEY ("matchedExpenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template_items" ADD CONSTRAINT "onboarding_template_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_onboarding_tasks" ADD CONSTRAINT "worker_onboarding_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_onboarding_tasks" ADD CONSTRAINT "worker_onboarding_tasks_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

