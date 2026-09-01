-- AlterTable
ALTER TABLE "bank_transactions" ADD COLUMN     "category" "ExpenseCategory";

-- CreateTable
CREATE TABLE "bank_transaction_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transaction_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_transaction_rules_companyId_idx" ON "bank_transaction_rules"("companyId");

-- AddForeignKey
ALTER TABLE "bank_transaction_rules" ADD CONSTRAINT "bank_transaction_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
