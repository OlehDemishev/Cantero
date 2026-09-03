-- CreateEnum
CREATE TYPE "VendorBillStatus" AS ENUM ('draft', 'approved', 'paid');

-- CreateEnum
CREATE TYPE "TrainingEnrollmentStatus" AS ENUM ('enrolled', 'completed');

-- CreateEnum
CREATE TYPE "SuretyBondType" AS ENUM ('bid', 'performance', 'payment', 'maintenance');

-- CreateEnum
CREATE TYPE "SuretyBondStatus" AS ENUM ('active', 'released', 'expired');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('straight_line', 'declining_balance');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "bondingCapacityLimit" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "equipment" ADD COLUMN     "depreciationMethod" "DepreciationMethod",
ADD COLUMN     "salvageValue" DECIMAL(12,2),
ADD COLUMN     "usefulLifeMonths" INTEGER;

-- CreateTable
CREATE TABLE "vendor_bills" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "billNumber" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "VendorBillStatus" NOT NULL DEFAULT 'draft',
    "approvedAt" TIMESTAMP(3),
    "approvedByName" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bill_lines" (
    "id" TEXT NOT NULL,
    "vendorBillId" TEXT NOT NULL,
    "materialCatalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "vendor_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_courses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "validityMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_enrollments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "TrainingEnrollmentStatus" NOT NULL DEFAULT 'enrolled',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "score" INTEGER,
    "notes" TEXT,

    CONSTRAINT "training_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surety_bonds" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "SuretyBondType" NOT NULL,
    "bondNumber" TEXT,
    "suretyName" TEXT NOT NULL,
    "agentContact" TEXT,
    "penalSum" DECIMAL(14,2) NOT NULL,
    "premium" DECIMAL(12,2),
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "status" "SuretyBondStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surety_bonds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "disposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleAmount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_bills_companyId_idx" ON "vendor_bills"("companyId");

-- CreateIndex
CREATE INDEX "vendor_bills_supplierId_idx" ON "vendor_bills"("supplierId");

-- CreateIndex
CREATE INDEX "vendor_bills_purchaseOrderId_idx" ON "vendor_bills"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "vendor_bill_lines_vendorBillId_idx" ON "vendor_bill_lines"("vendorBillId");

-- CreateIndex
CREATE INDEX "training_courses_companyId_idx" ON "training_courses"("companyId");

-- CreateIndex
CREATE INDEX "training_enrollments_companyId_idx" ON "training_enrollments"("companyId");

-- CreateIndex
CREATE INDEX "training_enrollments_courseId_idx" ON "training_enrollments"("courseId");

-- CreateIndex
CREATE INDEX "training_enrollments_workerId_idx" ON "training_enrollments"("workerId");

-- CreateIndex
CREATE INDEX "surety_bonds_companyId_idx" ON "surety_bonds"("companyId");

-- CreateIndex
CREATE INDEX "surety_bonds_projectId_idx" ON "surety_bonds"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_disposals_equipmentId_key" ON "asset_disposals"("equipmentId");

-- CreateIndex
CREATE INDEX "asset_disposals_companyId_idx" ON "asset_disposals"("companyId");

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "vendor_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_materialCatalogItemId_fkey" FOREIGN KEY ("materialCatalogItemId") REFERENCES "material_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surety_bonds" ADD CONSTRAINT "surety_bonds_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surety_bonds" ADD CONSTRAINT "surety_bonds_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

