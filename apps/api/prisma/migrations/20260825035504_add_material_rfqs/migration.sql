-- CreateEnum
CREATE TYPE "MaterialRfqStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "material_rfqs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "MaterialRfqStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_rfq_lines" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "material_rfq_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_rfq_quotes" (
    "id" TEXT NOT NULL,
    "rfqLineId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "notes" TEXT,
    "isAwarded" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_rfq_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_rfqs_companyId_idx" ON "material_rfqs"("companyId");

-- CreateIndex
CREATE INDEX "material_rfqs_projectId_idx" ON "material_rfqs"("projectId");

-- CreateIndex
CREATE INDEX "material_rfq_lines_rfqId_idx" ON "material_rfq_lines"("rfqId");

-- CreateIndex
CREATE INDEX "material_rfq_quotes_supplierId_idx" ON "material_rfq_quotes"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "material_rfq_quotes_rfqLineId_supplierId_key" ON "material_rfq_quotes"("rfqLineId", "supplierId");

-- AddForeignKey
ALTER TABLE "material_rfqs" ADD CONSTRAINT "material_rfqs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_rfqs" ADD CONSTRAINT "material_rfqs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_rfq_lines" ADD CONSTRAINT "material_rfq_lines_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "material_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_rfq_lines" ADD CONSTRAINT "material_rfq_lines_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_rfq_quotes" ADD CONSTRAINT "material_rfq_quotes_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "material_rfq_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_rfq_quotes" ADD CONSTRAINT "material_rfq_quotes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

