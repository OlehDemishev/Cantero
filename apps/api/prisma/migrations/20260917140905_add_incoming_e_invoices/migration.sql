-- CreateEnum
CREATE TYPE "IncomingEInvoiceFormat" AS ENUM ('xrechnung_ubl', 'xrechnung_cii', 'zugferd', 'peppol_ubl');

-- CreateEnum
CREATE TYPE "IncomingEInvoiceStatus" AS ENUM ('pending_review', 'matched', 'converted', 'rejected');

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "vatId" TEXT;

-- CreateTable
CREATE TABLE "incoming_e_invoices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "format" "IncomingEInvoiceFormat" NOT NULL,
    "status" "IncomingEInvoiceStatus" NOT NULL DEFAULT 'pending_review',
    "rawFileStorageKey" TEXT NOT NULL,
    "rawFileName" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "currency" TEXT,
    "sellerName" TEXT,
    "sellerVatId" TEXT,
    "sellerStreet" TEXT,
    "sellerCity" TEXT,
    "sellerPostalCode" TEXT,
    "sellerCountryCode" TEXT,
    "subtotal" DECIMAL(14,2),
    "taxAmount" DECIMAL(14,2),
    "total" DECIMAL(14,2),
    "validationErrors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supplierId" TEXT,
    "vendorBillId" TEXT,
    "rejectedReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incoming_e_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incoming_e_invoice_lines" (
    "id" TEXT NOT NULL,
    "incomingEInvoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "taxRatePercent" DECIMAL(5,2),

    CONSTRAINT "incoming_e_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incoming_e_invoices_vendorBillId_key" ON "incoming_e_invoices"("vendorBillId");

-- CreateIndex
CREATE INDEX "incoming_e_invoices_companyId_idx" ON "incoming_e_invoices"("companyId");

-- CreateIndex
CREATE INDEX "incoming_e_invoices_companyId_status_idx" ON "incoming_e_invoices"("companyId", "status");

-- CreateIndex
CREATE INDEX "incoming_e_invoice_lines_incomingEInvoiceId_idx" ON "incoming_e_invoice_lines"("incomingEInvoiceId");

-- AddForeignKey
ALTER TABLE "incoming_e_invoices" ADD CONSTRAINT "incoming_e_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_e_invoices" ADD CONSTRAINT "incoming_e_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_e_invoices" ADD CONSTRAINT "incoming_e_invoices_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "vendor_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_e_invoice_lines" ADD CONSTRAINT "incoming_e_invoice_lines_incomingEInvoiceId_fkey" FOREIGN KEY ("incomingEInvoiceId") REFERENCES "incoming_e_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

