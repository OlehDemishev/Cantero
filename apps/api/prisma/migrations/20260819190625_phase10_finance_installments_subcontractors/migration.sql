-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "expectedDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "invoice_installments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractors" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,

    CONSTRAINT "subcontractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_costs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "incurredDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "paid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "subcontractor_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_installments_invoiceId_idx" ON "invoice_installments"("invoiceId");

-- CreateIndex
CREATE INDEX "subcontractors_companyId_idx" ON "subcontractors"("companyId");

-- CreateIndex
CREATE INDEX "subcontractor_costs_companyId_idx" ON "subcontractor_costs"("companyId");

-- CreateIndex
CREATE INDEX "subcontractor_costs_projectId_idx" ON "subcontractor_costs"("projectId");

-- CreateIndex
CREATE INDEX "subcontractor_costs_subcontractorId_idx" ON "subcontractor_costs"("subcontractorId");

-- AddForeignKey
ALTER TABLE "invoice_installments" ADD CONSTRAINT "invoice_installments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_costs" ADD CONSTRAINT "subcontractor_costs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_costs" ADD CONSTRAINT "subcontractor_costs_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_costs" ADD CONSTRAINT "subcontractor_costs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
