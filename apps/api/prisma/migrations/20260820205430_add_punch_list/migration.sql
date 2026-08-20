-- CreateEnum
CREATE TYPE "PunchListItemStatus" AS ENUM ('open', 'resolved', 'verified');

-- CreateTable
CREATE TABLE "punch_list_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "status" "PunchListItemStatus" NOT NULL DEFAULT 'open',
    "assigneeWorkerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedByName" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "verifiedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punch_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "punch_list_items_projectId_idx" ON "punch_list_items"("projectId");

-- CreateIndex
CREATE INDEX "punch_list_items_companyId_idx" ON "punch_list_items"("companyId");

-- AddForeignKey
ALTER TABLE "punch_list_items" ADD CONSTRAINT "punch_list_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_list_items" ADD CONSTRAINT "punch_list_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_list_items" ADD CONSTRAINT "punch_list_items_assigneeWorkerId_fkey" FOREIGN KEY ("assigneeWorkerId") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
