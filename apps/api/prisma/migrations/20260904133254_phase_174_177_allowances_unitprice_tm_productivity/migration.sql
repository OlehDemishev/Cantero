-- CreateEnum
CREATE TYPE "AllowanceStatus" AS ENUM ('active', 'exceeded', 'closed');

-- CreateEnum
CREATE TYPE "TMTicketStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentCategory" ADD VALUE 'as_built';
ALTER TYPE "DocumentCategory" ADD VALUE 'om_manual';

-- CreateTable
CREATE TABLE "allowances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budgetedAmount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "status" "AllowanceStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowance_charges" (
    "id" TEXT NOT NULL,
    "allowanceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "chargedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT,

    CONSTRAINT "allowance_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_price_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "contractUnitPrice" DECIMAL(12,4) NOT NULL,
    "estimatedQuantity" DECIMAL(14,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_price_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_price_measurements" (
    "id" TEXT NOT NULL,
    "unitPriceItemId" TEXT NOT NULL,
    "measuredQuantity" DECIMAL(14,4) NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "measuredByName" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "unit_price_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tm_tickets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "laborCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "equipmentCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "materialCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "TMTicketStatus" NOT NULL DEFAULT 'draft',
    "ownerSignerName" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tm_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "quantityCompleted" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "laborHours" DECIMAL(10,2) NOT NULL,
    "crewName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productivity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "allowances_companyId_idx" ON "allowances"("companyId");

-- CreateIndex
CREATE INDEX "allowances_projectId_idx" ON "allowances"("projectId");

-- CreateIndex
CREATE INDEX "allowance_charges_allowanceId_idx" ON "allowance_charges"("allowanceId");

-- CreateIndex
CREATE INDEX "unit_price_items_companyId_idx" ON "unit_price_items"("companyId");

-- CreateIndex
CREATE INDEX "unit_price_items_projectId_idx" ON "unit_price_items"("projectId");

-- CreateIndex
CREATE INDEX "unit_price_measurements_unitPriceItemId_idx" ON "unit_price_measurements"("unitPriceItemId");

-- CreateIndex
CREATE INDEX "tm_tickets_companyId_idx" ON "tm_tickets"("companyId");

-- CreateIndex
CREATE INDEX "tm_tickets_projectId_idx" ON "tm_tickets"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "tm_tickets_projectId_ticketNumber_key" ON "tm_tickets"("projectId", "ticketNumber");

-- CreateIndex
CREATE INDEX "productivity_logs_companyId_idx" ON "productivity_logs"("companyId");

-- CreateIndex
CREATE INDEX "productivity_logs_projectId_idx" ON "productivity_logs"("projectId");

-- CreateIndex
CREATE INDEX "productivity_logs_costCodeId_idx" ON "productivity_logs"("costCodeId");

-- AddForeignKey
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowance_charges" ADD CONSTRAINT "allowance_charges_allowanceId_fkey" FOREIGN KEY ("allowanceId") REFERENCES "allowances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_price_items" ADD CONSTRAINT "unit_price_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_price_items" ADD CONSTRAINT "unit_price_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_price_measurements" ADD CONSTRAINT "unit_price_measurements_unitPriceItemId_fkey" FOREIGN KEY ("unitPriceItemId") REFERENCES "unit_price_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_tickets" ADD CONSTRAINT "tm_tickets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tm_tickets" ADD CONSTRAINT "tm_tickets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_logs" ADD CONSTRAINT "productivity_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_logs" ADD CONSTRAINT "productivity_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_logs" ADD CONSTRAINT "productivity_logs_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

