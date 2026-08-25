-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('materials', 'fuel', 'tools', 'permits', 'meals', 'other');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'other',
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'pending',
    "receiptStorageKey" TEXT,
    "receiptMimeType" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_companyId_idx" ON "expenses"("companyId");

-- CreateIndex
CREATE INDEX "expenses_projectId_idx" ON "expenses"("projectId");

-- CreateIndex
CREATE INDEX "expenses_workerId_idx" ON "expenses"("workerId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

