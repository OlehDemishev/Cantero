-- AlterTable
ALTER TABLE "deficiencies" ADD COLUMN     "location" TEXT;

-- CreateTable
CREATE TABLE "schedule_baselines" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_baseline_tasks" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "schedule_baseline_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_lines" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bid_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_baselines_companyId_idx" ON "schedule_baselines"("companyId");

-- CreateIndex
CREATE INDEX "schedule_baselines_projectId_idx" ON "schedule_baselines"("projectId");

-- CreateIndex
CREATE INDEX "schedule_baseline_tasks_baselineId_idx" ON "schedule_baseline_tasks"("baselineId");

-- CreateIndex
CREATE INDEX "bid_lines_bidId_idx" ON "bid_lines"("bidId");

-- AddForeignKey
ALTER TABLE "schedule_baselines" ADD CONSTRAINT "schedule_baselines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_baselines" ADD CONSTRAINT "schedule_baselines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_baseline_tasks" ADD CONSTRAINT "schedule_baseline_tasks_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "schedule_baselines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_lines" ADD CONSTRAINT "bid_lines_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

