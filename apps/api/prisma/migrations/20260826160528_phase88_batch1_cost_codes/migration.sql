-- AlterTable
ALTER TABLE "change_order_lines" ADD COLUMN     "costCodeId" TEXT;

-- AlterTable
ALTER TABLE "estimate_lines" ADD COLUMN     "costCodeId" TEXT;

-- AlterTable
ALTER TABLE "subcontractor_costs" ADD COLUMN     "costCodeId" TEXT;

-- CreateTable
CREATE TABLE "cost_codes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "cost_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_codes_companyId_idx" ON "cost_codes"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "cost_codes_companyId_code_key" ON "cost_codes"("companyId", "code");

-- CreateIndex
CREATE INDEX "change_order_lines_costCodeId_idx" ON "change_order_lines"("costCodeId");

-- CreateIndex
CREATE INDEX "estimate_lines_costCodeId_idx" ON "estimate_lines"("costCodeId");

-- CreateIndex
CREATE INDEX "subcontractor_costs_costCodeId_idx" ON "subcontractor_costs"("costCodeId");

-- AddForeignKey
ALTER TABLE "change_order_lines" ADD CONSTRAINT "change_order_lines_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_costs" ADD CONSTRAINT "subcontractor_costs_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

