-- AlterEnum
ALTER TYPE "VendorBillStatus" ADD VALUE 'void';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "correctsInvoiceId" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vendor_bills" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "gobd_ledger_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actorName" TEXT NOT NULL,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gobd_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gobd_ledger_entries_companyId_entityType_entityId_idx" ON "gobd_ledger_entries"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "gobd_ledger_entries_companyId_sequence_key" ON "gobd_ledger_entries"("companyId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_correctsInvoiceId_key" ON "invoices"("correctsInvoiceId");

-- AddForeignKey
ALTER TABLE "gobd_ledger_entries" ADD CONSTRAINT "gobd_ledger_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_correctsInvoiceId_fkey" FOREIGN KEY ("correctsInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

