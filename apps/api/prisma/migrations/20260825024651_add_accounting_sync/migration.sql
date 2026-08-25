-- CreateEnum
CREATE TYPE "AccountingProvider" AS ENUM ('quickbooks', 'xero');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "externalAccountingId" TEXT,
ADD COLUMN     "externalAccountingSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "accounting_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_connections_companyId_key" ON "accounting_connections"("companyId");

-- AddForeignKey
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

