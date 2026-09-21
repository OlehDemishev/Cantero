-- AlterTable
ALTER TABLE "change_orders" ADD COLUMN     "intacctChangeOrderId" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "intacctCustomerId" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "intacctContractId" TEXT,
ADD COLUMN     "intacctProjectId" TEXT;

-- CreateTable
CREATE TABLE "intacct_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "changeOrderItemId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intacct_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intacct_connections_companyId_key" ON "intacct_connections"("companyId");

-- AddForeignKey
ALTER TABLE "intacct_connections" ADD CONSTRAINT "intacct_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

