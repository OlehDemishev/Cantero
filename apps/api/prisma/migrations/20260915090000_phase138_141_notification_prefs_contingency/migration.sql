-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "mutedNotificationTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "contingencyAmount" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "contingency_draws" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contingency_draws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contingency_draws_companyId_idx" ON "contingency_draws"("companyId");

-- CreateIndex
CREATE INDEX "contingency_draws_projectId_idx" ON "contingency_draws"("projectId");

-- AddForeignKey
ALTER TABLE "contingency_draws" ADD CONSTRAINT "contingency_draws_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingency_draws" ADD CONSTRAINT "contingency_draws_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

