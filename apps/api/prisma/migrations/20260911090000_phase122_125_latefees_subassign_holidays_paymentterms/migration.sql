-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "paymentTermsDays" INTEGER;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "lateFeePercentPerMonth" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "punch_list_items" ADD COLUMN     "assigneeSubcontractorId" TEXT;

-- CreateTable
CREATE TABLE "company_holidays" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "company_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_holidays_companyId_idx" ON "company_holidays"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_holidays_companyId_date_key" ON "company_holidays"("companyId", "date");

-- CreateIndex
CREATE INDEX "punch_list_items_assigneeSubcontractorId_idx" ON "punch_list_items"("assigneeSubcontractorId");

-- AddForeignKey
ALTER TABLE "punch_list_items" ADD CONSTRAINT "punch_list_items_assigneeSubcontractorId_fkey" FOREIGN KEY ("assigneeSubcontractorId") REFERENCES "subcontractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_holidays" ADD CONSTRAINT "company_holidays_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

