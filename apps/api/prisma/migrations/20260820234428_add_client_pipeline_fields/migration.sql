-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "estimatedValue" DECIMAL(12,2),
ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "ownerWorkerId" TEXT,
ADD COLUMN     "wonAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "clients_ownerWorkerId_idx" ON "clients"("ownerWorkerId");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_ownerWorkerId_fkey" FOREIGN KEY ("ownerWorkerId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
